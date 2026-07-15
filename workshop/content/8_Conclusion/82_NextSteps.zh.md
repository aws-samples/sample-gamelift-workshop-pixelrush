---
title: "进阶方向"
weight: 82
---

## 继续深入

| 主题 | 为什么是自然的下一步 |
|---|---|
| **附录：多区域 fleet**（本 workshop） | 添加东京/新加坡 location 与基于延迟的放置——20 分钟，改一处 CDK |
| **Match backfill** | 向运行中的会话补充玩家（我们刻意关闭了它——赛车不收中途加入者，但大逃杀需要） |
| **FleetIQ / Spot** | 用受管理的 Spot 实例削减最多 70% 的 fleet 成本 |
| **容器 fleet** | 用容器镜像替代 build 打包服务器 |
| **玩家身份** | 用真实鉴权替换 workshop 密码——参见 [Custom Game Backend guidance](https://github.com/aws-solutions-library-samples/guidance-for-custom-game-backend-hosting-on-aws)（Steam/Apple/Google 登录、JWT） |
| **会话指标与自动伸缩** | 基于 `PercentAvailableGameSessions` 的目标跟踪伸缩 |

## 参考资料

- [Amazon GameLift Servers 文档](https://docs.aws.amazon.com/gamelift/)
- [FlexMatch 规则集参考](https://docs.aws.amazon.com/gamelift/latest/flexmatchguide/match-rulesets.html)
- [GameLift Server SDK（Go/C++/C#/Unreal/Unity）](https://github.com/orgs/amazon-gamelift/repositories)
- 本 workshop 的游戏源码——今天部署的一切都可读、可改、任你扩展

感谢与我们同场竞速！🏁
