---
title: "销毁资源栈"
weight: 71
---

{{% notice info %}}
**AWS 活动路径**：跳过本页——临时账号会在活动结束后自动回收。
{{% /notice %}}

## 一条命令

```bash
cd infra
npx cdk destroy PixelRushGameLiftStack PixelRushFrontendStack PixelRushBackendStack --force
```

约 10 分钟（主要耗在 fleet 终止上）。可以关掉终端——删除在服务端继续进行。

## 验证（账单安全检查清单）

唯一有实际小时成本的资源是 fleet 实例。确认：

1. 控制台 → **GameLift → Fleets**：`PixelRushFleet` 处于 *Deleting* 或已消失
2. 控制台 → **CloudFormation**：三个 `PixelRush*` stack 均为
   *DELETE_COMPLETE*（或已不存在）
3. 可选：**GameLift → Builds**——build 默认保留且不产生费用，
   但可手动删除 `PixelRushServer`

{{% notice tip %}}
其余资源（Lambda、按需 DynamoDB、API Gateway、CloudFront）都是按请求计费——
零流量即零成本，即使删除有延迟也不会产生费用。
{{% /notice %}}
