---
title: "路径 A：AWS 主办活动"
weight: 21
---

{{% notice info %}}
仅当你在 AWS 主办活动现场、持有 Workshop Studio 接入码时走本页。
否则请跳到**路径 B：自己的账号**。
{{% /notice %}}

## 1. 加入活动

1. 打开 [Workshop Studio](https://catalog.workshops.aws/join)，输入讲师提供的
   **接入码（access code）**。
2. 接受条款，点击 **Join event**。你获得一个临时 AWS 账号——今天的所有操作
   都不产生个人费用。

## 2. 打开开发环境

活动账号预置了一台**云上开发机**（浏览器里的 VS Code），所有工具已装好：

1. 在活动页面找到 **Event Outputs** 区域。
2. 打开 **CodeServerURL** 链接（一个 `cloudfront.net` 地址），输入
   **CodeServerPassword**。
3. 浏览器中的 VS Code 已把 workshop 仓库克隆在 `~/gamelift-workshop`。

在其中打开终端（`菜单 → Terminal → New Terminal`）并验证：

```bash
node --version && go version && cdk --version && aws sts get-caller-identity
```

四条命令应分别输出版本号 / 你的临时账号 ID。

{{% notice tip %}}
在本路径中，模块 3（GameLift Anywhere）里的"你的机器"指的就是**这台云上开发机**——
其安全组已放行游戏端口，你的浏览器可以直连跑在它上面的游戏会话。
{{% /notice %}}

继续前往 **2.3 初始化**（跳过路径 B）。
