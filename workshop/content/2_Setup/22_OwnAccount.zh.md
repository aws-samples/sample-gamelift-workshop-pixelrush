---
title: "路径 B：自己的账号"
weight: 22
---

{{% notice warning %}}
**费用估算**：托管 fleet 运行期间约 **$0.11/小时**（us-east-1 一台 c5.large
Amazon GameLift Servers 实例）；Serverless 组件按请求计费，几乎可忽略。fleet
只在 workshop 后半段存在，清理模块又会删除全部资源——完整跑完 2 小时通常远低于 $1。
{{% /notice %}}

## 1. AWS 账号与凭证

需要一个具备**管理员级权限**的账号（CDK 要创建 IAM 角色、GameLift fleet、
CloudFront 分发）。在本机配置凭证：

```bash
aws configure   # 或 aws sso login / 环境变量
aws sts get-caller-identity   # 验证——应输出你的账号 ID
```

选择一个支持 GameLift 的区域；本 workshop 以 **us-east-1** 为准。若想换成别的区域，
请先在
[Amazon GameLift Servers 支持的位置](https://docs.aws.amazon.com/gameliftservers/latest/developerguide/gamelift-regions.html)
中确认。部署前先设置并验证：

```bash
aws configure set region us-east-1
aws configure get region   # 预期：us-east-1
```

## 2. 安装工具

| 工具 | 版本 | 验证 |
|---|---|---|
| Node.js | 20+ | `node --version` |
| Go | 1.26.2+ | `go version` |
| AWS CLI | v2 | `aws --version` |
| AWS CDK | v2 | `npx cdk --version`（无需安装——`npx` 自动获取） |

macOS 一条命令（Homebrew）：`brew install node go awscli`
Windows：从各工具官网安装，或使用 WSL2。

安装完成后，逐条运行上表**验证**列中的命令——继续之前，四个命令都应无报错地打印出版本号。

{{% notice tip %}}
如果你选做可选的**附录 A：GameLift Anywhere**，其中"你的机器"就是**你的笔记本**——
Mac 和 Windows 都可以。游戏服务器在本机运行，浏览器连接 `127.0.0.1`，
不需要任何防火墙改动。
{{% /notice %}}

继续前往 **2.3 初始化**。
