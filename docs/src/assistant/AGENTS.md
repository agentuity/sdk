# Docs Assistant Guide

This folder contains helper logic for documentation assistants, such as Ask AI.

## Rules

- Keep assistant logic as plain functions. Do not wrap it in `defineDemoAgent()`.
- Routes should validate request bodies, then call assistant functions directly.
- Other internal assistants, such as Pulse, can call these functions as tools.
- Do not show this folder's internals as public v3 app patterns.
- New v3 examples must use framework routes, server functions, service clients, queue consumers, schedules, tasks, webhooks, or plain shared functions.
