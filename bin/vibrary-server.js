#!/usr/bin/env node

import { startServer } from '../backend/server.js';

// Shortcut for `vibrary server` with default options (port 3000, auto-advance, open browser)
await startServer();
