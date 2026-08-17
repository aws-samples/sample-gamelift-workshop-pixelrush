---
title: "路径 A：AWS 主办活动"
weight: 21
---

{{% notice info %}}
仅当你在 AWS 主办活动现场、持有 Workshop Studio 接入码时走本页。
否则请跳到**路径 B：自己的账号**。
{{% /notice %}}

## 1. 加入活动

1. 打开 [Workshop Studio](https://catalog.workshops.aws/join)——AWS 官方的动手
   实验托管平台，在临时活动账号中运行 workshop——输入讲师提供的
   **接入码（access code）**。
2. 接受条款，点击 **Join event**。你获得一个临时 AWS 账号——今天的所有操作
   都不产生个人费用。

## 2. 打开开发环境

活动账号预置了一台**云上开发机**（浏览器里的 VS Code）。它的地址和密码都在活动
页面上——每个参与者 stack 的密码各不相同。

1. 在活动页面找到 **Event Outputs**，打开 **CodeServerURL**（一个
   `cloudfront.net` 地址）。
2. 用同一处 Event Outputs 里的 **CodeServerPassword** 登录。不要分享这个密码——
   这台机器在你的临时账号中拥有部署权限。
3. VS Code 打开后，workshop 仓库已克隆到 `~/gamelift-workshop`。

打开终端（`菜单 → Terminal → New Terminal`）并验证：

```bash
node --version && go version && cdk --version && aws sts get-caller-identity
```

四条命令应分别输出版本号 / 你的临时账号 ID。

{{% notice tip %}}
code-server 源站只允许 CloudFront 访问，并且还需要每人独立的密码。如果登录失败，
请从你自己的 Event Outputs 里重新复制 **CodeServerPassword**——每个人都不一样。
{{% /notice %}}

{{% notice info %}}
如果你选做可选的**附录 A：GameLift Anywhere**，其中“你的机器”指的就是**这台云上开发机**。
它的游戏端口默认关闭，附录会指导你只对当前公网 IPv4 地址临时开放
TCP/UDP 1935，并在检查点完成后立即删除规则。主线流程不需要开放该端口。
{{% /notice %}}

继续前往 **2.3 初始化**（跳过路径 B）。
