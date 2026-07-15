---
title: "验证你自己的服务器"
weight: 61
---

## 统一前端

Pixel Rush 客户端内置服务器选择器。登录页上：

- **☁️ AWS ARENA** — 官方 workshop 服务器（讲师的部署）
- **🔧 MY SERVER** — *任意* Pixel Rush 后端，用它的 API URL 标识

MY SERVER 的原理：调用目标后端的 `/api/info` 发现端点，确认它是一个
Pixel Rush arena，然后把整个客户端（登录、匹配、通知）接到那套部署上。

## 证明你的部署

这是毕业考——**你**搭建的完整管道，一条流程验证到底：

![登录页选择 MY SERVER 并粘贴你的 ApiUrl](/images/gl-ws-myserver.png)

1. 打开**官方 workshop 站点**（讲师提供的 URL——这次*不是*你自己的 SiteUrl）
2. 登录页点击 **🔧 MY SERVER**
3. 粘贴**你的** `ApiUrl`（模块 2 保存过；忘了可以重查：
   `aws cloudformation describe-stacks --stack-name PixelRushBackendStack --query "Stacks[0].Outputs"`）
4. 输入车手名 + 密码 `gamelift` → **START ENGINE**
5. 大厅副标题显示你在自己的 arena 上。现在 **RACE → 2P**（再开一个标签页）→
   比赛跑在**你的 EC2 fleet** 上

刚刚发生了什么：由*别人的* CloudFront 提供的前端，调用了**你的** API Gateway，
经过**你的** FlexMatch 撮合，最终在**你的** GameLift fleet 上完成了比赛。

## 检查点 ★

大厅副标题显示 `🔧`（你的 arena），完成一场 2P 比赛。控制台复核：
游戏会话出现在**你**账号的 PixelRushFleet 下。
