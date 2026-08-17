---
title: "3. 托管 Fleet"
chapter: true
weight: 30
---
*时长：约 30 分钟（含约 15 分钟 fleet 激活等待——用于阅读）*

你的第一局托管游戏会话，而且直接就是生产级托管：上传服务器 build，让
Amazon GameLift Servers 在托管 EC2 实例上运行它——配合 GameLift 签发的
TLS 证书——然后真正**和另一个玩家对战**。

流程是先发起部署，再利用激活等待时间读懂正在被创建的东西：fleet 配置、
GameLift 即将运行的那份 Server SDK 代码，以及 queue 如何挑选位置。

为了聚焦在 fleet 本身，本模块采用**直接放置、无匹配规则**：谁选了某条赛道，
就和下一个选它的人共享同一局。基于规则的匹配放在模块 4。
