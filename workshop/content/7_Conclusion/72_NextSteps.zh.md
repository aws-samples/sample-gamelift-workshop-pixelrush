---
title: "进阶方向"
weight: 72
---

## 继续深入

| 主题 | 为什么是自然的下一步 |
|---|---|
| **附录 B：多区域 fleet**（本 workshop） | 添加一个远端 location，看延迟路由把会话放过去——20 分钟，控制台点几下 |
| **附录 A：GameLift Anywhere**（本 workshop） | 在自己的笔记本或本地机房硬件上托管一局会话——快速迭代与混合托管路线，15 分钟 |
| **Match backfill** | 向运行中的会话补充玩家（我们刻意关闭了它——赛车不收中途加入者，但大逃杀需要） |
| **FleetIQ / Spot** | 用受管理的 Spot 实例削减最多 70% 的 fleet 成本 |
| **容器 fleet** | 用容器镜像替代 build 打包服务器 |
| **玩家身份** | 用真实鉴权替换 workshop 密码——参见 [Custom Game Backend guidance](https://github.com/aws-solutions-library-samples/guidance-for-custom-game-backend-hosting-on-aws)，这是 AWS Solutions Library 提供的游戏后端参考实现，内置玩家身份（Steam/Apple/Google 登录、JWT） |
| **会话指标与自动伸缩** | 基于 `PercentAvailableGameSessions` 的目标跟踪伸缩 |

{{% notice info %}}
**生产环境提示——IAM 最小权限：** 本 workshop 的云上开发机没有挂任何"一把梭"的
托管策略。`workshop-studio.yaml` 里就是一个收窄部署角色的现成范例：
`DevInstanceCdkDeployPolicy` 把所有写操作限制在 `CDKToolkit` / `PixelRush*` 两类
stack 和 `cdk-*` 前缀的 staging 资源上；而且由于 `cdk deploy` 实际是 assume
bootstrap 角色来执行的，这台机器本身**完全不需要** GameLift、Lambda、DynamoDB
的写权限。剩下两处 `Resource: "*"` 都是刻意保留的：三个不支持资源级授权的
CloudFormation API，以及让参与者能在终端查看状态的跨服务只读权限。在生产环境中，
应针对支持 ARN 收窄的服务把这部分只读范围进一步收紧。
{{% /notice %}}

## 参考资料

- [Amazon GameLift Servers 文档](https://docs.aws.amazon.com/gamelift/)——
  官方服务文档：fleet、queue、FlexMatch、Server SDK 及 API 参考
- [FlexMatch 规则集参考](https://docs.aws.amazon.com/gamelift/latest/flexmatchguide/match-rulesets.html)——
  完整的规则集 schema（规则类型、expansion、队伍定义），用于编写你自己的匹配规则
- [GameLift Server SDK（Go/C++/C#/Unreal/Unity）](https://github.com/orgs/amazon-gamelift/repositories)——
  官方 Amazon GameLift SDK 仓库，含各语言/引擎的服务端集成库
- 本 workshop 的游戏源码——今天部署的一切都可读、可改、任你扩展

感谢与我们同场竞速！🏁
