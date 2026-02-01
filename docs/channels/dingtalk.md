---
title: DingTalk
---

OpenClaw supports DingTalk via a custom robot webhook (experimental).

## Setup

1. Create a DingTalk custom robot and get its webhook `access_token`.
2. Configure OpenClaw:

- `channels.dingtalk.accessToken`
- (optional) `channels.dingtalk.verificationToken`
- (optional) `channels.dingtalk.webhookPath` (default: `/dingtalk/webhook`)

3. Configure your DingTalk outgoing webhook / message callback to point at your gateway:

- `https://<your-gateway-host>/dingtalk/webhook`

## Notes

- This plugin currently parses inbound `text` messages only.
- Outbound sends go to the robot webhook configured by `channels.dingtalk.accessToken`.
