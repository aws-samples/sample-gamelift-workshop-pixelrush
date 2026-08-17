---
title: "附录 A：GameLift Anywhere（可选）"
chapter: true
weight: 80
---
*时长：约 15 分钟 · 需先完成模块 1–3*

一局托管在**你自己的机器**上、由 Amazon GameLift Servers 编排的游戏会话。
代码就是你在模块 3 里带读过的那份 Server SDK 集成，生命周期完全一致——
只是算力不同：fleet 的 compute 不再是 AWS 托管的 EC2 实例，而是你的笔记本
或云上开发机。

如果你想看看游戏工作室如何做到改一行服务器代码秒级验证（而不是等 15 分钟
fleet 激活），或者你有混合/本地机房托管的需求，就来做这个附录。

{{% notice info %}}
这里不会新部署任何东西——你的 stack 里本来就有一个 Anywhere fleet（无论
`stage` 取什么值它都会被创建），本附录只是往它上面注册一台 compute，
完全不影响你的托管 EC2 fleet。
{{% /notice %}}
