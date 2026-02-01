---
title: Lark (Feishu)
---

OpenClaw supports Lark/Feishu via a bot app on the Lark Open Platform.

## Setup

1. Create a bot app in Lark Open Platform.
2. Configure event subscription to point to your OpenClaw gateway webhook path (default: `/lark/webhook`).
3. Set these config keys:

- `channels.lark.appId`
- `channels.lark.appSecret`
- `channels.lark.verificationToken`

## Notes

- This channel currently handles inbound `im.message.receive_v1` text messages.
- If you enable encryption for event callbacks, you will need to disable it for now (plugin currently expects plaintext callbacks).
