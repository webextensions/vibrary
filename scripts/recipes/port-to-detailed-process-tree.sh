#!/usr/bin/env bash

# -----------------------------------------------------------------------------
# Overview
# -----------------------------------------------------------------------------
# Map a TCP port to its listener(s), print rich process fields and the parent
# chain toward PID 1, optionally show compact then full `pstree` output, and repeat
# a listener summary (including STAT / elapsed / start) so key details stay near
# the bottom after long trees. A final section lists copy-paste follow-up commands.
#
# Environment
#   - Linux; standard CLI only (no GUI).
#   - Requires `lsof` and non-interactive `sudo` (`sudo -n`) for port inspection.
#   - Optional `pstree` (often package `psmisc`); if missing, prints an install
#     hint and skips trees only.
#
# Behaviour (output order matches the implementation)
#   - CLI: `--port <1-65535>`; optional `--pid <n>`; `-h` / `--help`.
#   - Listener PIDs: unique PIDs from `sudo lsof -nP -iTCP:<port> -sTCP:LISTEN -t`,
#     sorted numerically. Default: smallest PID for the walk / pstree / summary. If
#     `--pid` is set, that PID must appear in that set and is used instead. If
#     several match, all PIDs are printed first.
#   - "Listening socket": `sudo lsof -nP -iTCP:<port> -sTCP:LISTEN` (not
#     unfiltered "everything on :port", which would include client / ESTAB noise).
#   - Ancestor walk: for the listener, then each parent until PID 1 or missing
#     `/proc/<pid>`: PID, PPID, USER, COMM, EXE (`readlink` on `/proc/<pid>/exe`),
#     CMD (`ps -o args=`).
#   - If `pstree` is installed: two sections in order - compact (`sudo pstree -sp`),
#     then full (`sudo pstree -saclp`) so trees include other users' children when
#     non-interactive sudo is available. Each section prints the command line, a
#     divider, then the tree.
#   - "Main process - summary": same listener PID again with the same core
#     fields plus STAT, ELAPSED (`ps` etime), and START (`ps` lstart).
#   - "Helpful commands": copy-paste examples (lsof, ss, fuser, ps, `/proc`,
#     both pstrees, signals, watch) plus an "all uses of :port" lsof line.
#
# Reference exploration (informative; not strict commands to embed)
#   - Broader fields: `sudo lsof -nP -i :<port> -t | xargs -r ps -fp` (includes
#     non-listener use; this script's listener PIDs are TCP LISTEN only.)
#   - Trees: normalize lsof -t output to lines, `sort -nu | head -n1` for a stable
#     default PID, then `sudo pstree -sp` / `sudo pstree -saclp` on that PID.
#
# -----------------------------------------------------------------------------
# Implementation
# -----------------------------------------------------------------------------
# Shell + `lsof`, `ps`, `/proc/<pid>/exe`, optional `pstree`, and
# `utils/bash-helpers/color-codes.sh` for ANSI styling.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/../../utils/bash-helpers/color-codes.sh"

usage() {
    local me
    me="$(basename "$0")"
    cat >&2 <<EOF
Show the process bound to a port and its ancestor chain.

Usage:
    ${me} --port <portNumber> [--pid <processId>]

Options:
    --port <n>   TCP port (1-65535)
    --pid <n>    When multiple processes listen on this port, use this PID for
                 the walk / pstree / summary (must be in the lsof listener set)
    -h, --help   Show this help
EOF
}

parse_cli_args() {
    PORT=""
    LISTENER_PID_OVERRIDE=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --port)
                if [ "$#" -lt 2 ] || [ -z "${2:-}" ]; then
                    echo "${RED}Error: --port requires a port number.${NORMAL}" >&2
                    usage
                    exit 2
                fi
                PORT="$2"
                shift 2
                ;;
            --pid)
                if [ "$#" -lt 2 ] || [ -z "${2:-}" ]; then
                    echo "${RED}Error: --pid requires a process id.${NORMAL}" >&2
                    usage
                    exit 2
                fi
                case "$2" in
                    *[!0-9]* | '')
                        echo "${RED}Error: --pid must be a positive integer.${NORMAL}" >&2
                        exit 2
                        ;;
                esac
                LISTENER_PID_OVERRIDE=$((10#$2))
                if [ "${LISTENER_PID_OVERRIDE}" -lt 1 ]; then
                    echo "${RED}Error: --pid must be a positive integer.${NORMAL}" >&2
                    exit 2
                fi
                shift 2
                ;;
            -h | --help)
                usage
                exit 0
                ;;
            *)
                echo "${RED}Unknown argument: $1${NORMAL}" >&2
                usage
                exit 2
                ;;
        esac
    done
}

parse_cli_args "$@"

ensure_port_listener_context_or_exit() {
    if [ -z "$PORT" ]; then
        echo "${RED}Error: --port is required.${NORMAL}" >&2
        usage
        exit 2
    fi

    case "$PORT" in
        *[!0-9]* | '')
            echo "${RED}Error: port must be a positive integer (1-65535).${NORMAL}" >&2
            exit 2
            ;;
    esac

    # Decimal base avoids leading-zero / octal ambiguity in numeric tests.
    PORT=$((10#$PORT))

    if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
        echo "${RED}Error: port must be between 1 and 65535.${NORMAL}" >&2
        exit 2
    fi

    if ! command -v lsof >/dev/null 2>&1; then
        echo "${RED}Error: lsof is not installed.${NORMAL}" >&2
        exit 1
    fi

    echo "${BLUE}Verifying/Requesting 'sudo' access ...${NORMAL}"

    if sudo -n true 2>/dev/null; then
        echo "${GREEN} ✔ 'sudo' access is available${NORMAL}"
    else
        echo "${RED} ✘ 'sudo' access is not available${NORMAL}"
        echo "This script needs 'sudo' access to inspect the process using the specified port."
        echo "Exiting with error code 1 since 'sudo' access is not granted."
        exit 1
    fi

    local listener_pids_raw
    listener_pids_raw=""
    if ! listener_pids_raw="$(sudo lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null)"; then
        :
    fi
    if [ -z "${listener_pids_raw}" ]; then
        echo "${YELLOW}No TCP listener on port ${PORT} (lsof found no matching PID).${NORMAL}"
        echo "To list every use of the port (including client sockets), run:"
        echo "  ${GRAY}sudo lsof -nP -i :${PORT}${NORMAL}"
        exit 1
    fi

    LISTENER_ALL_PIDS_SORTED="$(
        echo "${listener_pids_raw}" | tr ' \t' '\n' | sed '/^$/d' | sort -nu
    )"
    if [ -z "${LISTENER_ALL_PIDS_SORTED}" ]; then
        echo "${YELLOW}No process is using port ${PORT} (after normalizing lsof PIDs).${NORMAL}"
        exit 1
    fi

    LISTENER_PID_COUNT="$(grep -c . <<< "${LISTENER_ALL_PIDS_SORTED}" || true)"
    if [ -n "${LISTENER_PID_OVERRIDE}" ]; then
        if ! printf '%s\n' "${LISTENER_ALL_PIDS_SORTED}" | grep -qxF "${LISTENER_PID_OVERRIDE}"; then
            echo "${RED}Error: --pid ${LISTENER_PID_OVERRIDE} is not among the listener PIDs for port ${PORT} (lsof: TCP LISTEN).${NORMAL}" >&2
            echo "Matching PIDs: $(echo "${LISTENER_ALL_PIDS_SORTED}" | tr '\n' ' ' | sed 's/[[:space:]]*$//')" >&2
            exit 2
        fi
        LEAF_PID="${LISTENER_PID_OVERRIDE}"
    else
        LEAF_PID="$(echo "${LISTENER_ALL_PIDS_SORTED}" | head -n1)"
    fi
    if [ -z "${LEAF_PID}" ]; then
        echo "${YELLOW}No process is using port ${PORT} (could not pick a listener PID).${NORMAL}"
        exit 1
    fi
}

ensure_port_listener_context_or_exit

divider() {
    echo "${GRAY}----------------------------------------------------------------${NORMAL}"
}

# Args: pid, headline, optional third word "extended" for STAT / ELAPSED / START.
log_process_details() {
    local pid="$1"
    local headline="$2"
    local extended="${3:-}"

    if [ ! -d "/proc/${pid}" ]; then
        echo "${YELLOW}Process ${pid} no longer exists (vanished mid-walk).${NORMAL}"
        return 1
    fi

    local ppid user comm cmd exe
    ppid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')"
    user="$(ps -o user= -p "$pid" 2>/dev/null | tr -d ' \t')"
    comm="$(ps -o comm= -p "$pid" 2>/dev/null | tr -d '\n')"
    cmd="$(ps -o args= -p "$pid" 2>/dev/null | sed 's/[[:space:]]*$//')"
    exe="$(readlink -f "/proc/${pid}/exe" 2>/dev/null || true)"
    if [ -z "$exe" ] || [ ! -r "/proc/${pid}/exe" ]; then
        exe="(unavailable - kernel thread, zombie, or no access)"
    fi

    echo "${GREEN}● ${headline}${NORMAL}"
    echo "  PID       ${pid}"
    echo "  PPID      ${ppid:-?}"
    echo "  USER      ${user:-?}"
    echo "  COMM      ${comm}"
    echo "  EXE       ${exe}"
    echo "  CMD       ${cmd}"
    if [ "$extended" = "extended" ]; then
        local stat etime lstart
        stat="$(ps -o stat= -p "$pid" 2>/dev/null | tr -d ' \t' || true)"
        etime="$(ps -o etime= -p "$pid" 2>/dev/null | tr -d ' \t' || true)"
        lstart="$(ps -o lstart= -p "$pid" 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' || true)"
        echo "  STAT      ${stat:-?}"
        echo "  ELAPSED   ${etime:-?}"
        echo "  START     ${lstart:-?}"
    fi
    echo
    return 0
}

# Args: remainder after "sudo pstree " (e.g. "-saclp 12345").
print_pstree_invocation() {
    echo "${GRAY}Command:${NORMAL}"
    echo "  sudo pstree $1"
}

title_bar() {
    echo "${CYAN}════════════════════════════════════════════════════════════════${NORMAL}"
}

print_port_report_header() {
    echo
    title_bar
    echo "${BOLD}  Port ${PORT} - listener and parent chain${NORMAL}"
    title_bar
    echo
}

print_port_report_header

print_multiple_listener_notice_if_needed() {
    if [ "${LISTENER_PID_COUNT:-1}" -gt 1 ]; then
        local pid_list_space
        pid_list_space="$(echo "${LISTENER_ALL_PIDS_SORTED}" | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
        echo "${YELLOW}Multiple processes match port ${PORT} (TCP LISTEN; unique PIDs, numeric order): ${pid_list_space}${NORMAL}"
        if [ -n "${LISTENER_PID_OVERRIDE}" ]; then
            echo "${YELLOW}Using PID ${LEAF_PID} (from --pid) for the ancestor walk, pstree, and summary below.${NORMAL}"
        else
            echo "${YELLOW}Using smallest PID ${LEAF_PID} for the ancestor walk, pstree, and summary below.${NORMAL}"
        fi
        echo
    fi
}

print_multiple_listener_notice_if_needed

print_listening_socket_section() {
    echo "${BOLD}${BLUE}TCP listener (LISTEN; details use chosen PID)${NORMAL}"
    divider
    sudo lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null
    echo
}

print_listening_socket_section

print_ancestor_chain_from_leaf() {
    local level=0
    local pid="$LEAF_PID"
    local ppid
    local seen=""

    while [ -n "$pid" ]; do
        case " ${seen} " in
            *" ${pid} "*)
                echo "${YELLOW}Stopped ancestor walk: PID ${pid} already seen (cycle?).${NORMAL}"
                break
                ;;
        esac
        seen="${seen}${pid} "

        if [ "$level" -eq 0 ]; then
            log_process_details "$pid" "Level ${level} - process using port ${PORT}" || break
        else
            log_process_details "$pid" "Level ${level} - parent process" || break
        fi

        ppid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')"

        if [ "$pid" = "1" ] || [ -z "$ppid" ]; then
            break
        fi

        pid="$ppid"
        level=$((level + 1))
    done
}

print_ancestor_chain_from_leaf

print_pstree_sections_or_hint() {
    if command -v pstree >/dev/null 2>&1; then
        echo "${BOLD}${BLUE}Process tree - compact (sudo pstree -sp)${NORMAL}"
        print_pstree_invocation "-sp ${LEAF_PID}"
        divider
        if ! sudo pstree -sp "$LEAF_PID" 2>/dev/null; then
            echo "${YELLOW}(sudo pstree failed for PID ${LEAF_PID})${NORMAL}"
        fi

        echo
        echo "${BOLD}${BLUE}Process tree - full (sudo pstree -saclp)${NORMAL}"
        print_pstree_invocation "-saclp ${LEAF_PID}"
        divider
        if ! sudo pstree -saclp "$LEAF_PID" 2>/dev/null; then
            echo "${YELLOW}(sudo pstree failed for PID ${LEAF_PID})${NORMAL}"
        fi
    else
        echo "${YELLOW}Install pstree for a tree view (package: psmisc on many distros).${NORMAL}"
    fi
}

print_pstree_sections_or_hint

print_listener_summary_section() {
    echo
    echo "${BOLD}${BLUE}Main process - summary (same PID as port listener)${NORMAL}"
    divider
    if [ -d "/proc/${LEAF_PID}" ]; then
        log_process_details "$LEAF_PID" "Listener PID ${LEAF_PID} - TCP port ${PORT}" extended
    else
        echo "${YELLOW}Listener PID ${LEAF_PID} is no longer running (cannot print a summary).${NORMAL}"
        echo
    fi
}

print_listener_summary_section

print_helpful_commands() {
    echo "${BOLD}${BLUE}Helpful commands${NORMAL}"
    divider
    echo "${GRAY}Examples you can adapt (port=${PORT}, listener PID=${LEAF_PID}):${NORMAL}"
    echo
    echo "${BOLD}More socket / listener detail (matches this script)${NORMAL}"
    echo "  sudo lsof -nP -iTCP:${PORT} -sTCP:LISTEN${NORMAL}"
    echo
    echo "${BOLD}All uses of the port (clients, any state)${NORMAL}"
    echo "  ${BOLD}sudo lsof -nP -i :${PORT}${NORMAL}"
    echo
    echo "${BOLD}ss / fuser (TCP)${NORMAL}"
    echo "  sudo ss -tlnp | grep -E ':${PORT}([^0-9]|\$)'"
    echo "  sudo fuser -v ${PORT}/tcp"
    echo
    echo "${BOLD}More process detail for the listener${NORMAL}"
    echo "${BOLD}  ps -fp ${LEAF_PID} | cat${NORMAL}"
    echo "  sudo cat /proc/${LEAF_PID}/cmdline | xargs -0 echo"
    echo "  sudo ls -l /proc/${LEAF_PID}/fd"
    echo "${BOLD}  sudo pstree -sp ${LEAF_PID}${NORMAL}"
    echo "  sudo pstree -saclp ${LEAF_PID}"
    echo
    echo "${BOLD}Stop or signal the listener${NORMAL}"
    echo "  kill ${LEAF_PID}"
    echo "  sudo kill ${LEAF_PID}"
    echo "  sudo kill -TERM ${LEAF_PID}"
    echo "${BOLD}  sudo kill -9 ${LEAF_PID}${NORMAL}"
    echo
    echo "${BOLD}Watch while testing elsewhere${NORMAL}"
    echo "${BOLD}  watch -n1 lsof -i:${PORT}${NORMAL}"
    echo "  watch -n1 'sudo lsof -nP -iTCP:${PORT} -sTCP:LISTEN'"
    echo
}

print_helpful_commands
