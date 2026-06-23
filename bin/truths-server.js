#!/usr/bin/env node

import { startServer } from '../backend/server.js';

// Shortcut for `truths server` with default options (port 3000, auto-advance, open browser)
await startServer();
