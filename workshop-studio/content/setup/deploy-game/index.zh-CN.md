---
title: "部署游戏后端"
weight: 24
---

## 你要部署什么

两个 CDK stack——游戏的 *Web* 半边，暂不涉及 GameLift：

- **PixelRushBackendStack** — API Gateway + Lambda + DynamoDB（登录、车库、商店、
  排行榜、匹配 API）以及用于通知的 WebSocket API
- **PixelRushFrontendStack** — CloudFront + 私有 S3 上的 Phaser 网页客户端

## 1. 部署后端

在 `infra/` 目录下，先部署后端——前端构建时需要它的 WebSocket 地址：

```bash
npx cdk deploy PixelRushBackendStack --require-approval never
```

约 4 分钟。记下结尾的两个输出：

```
PixelRushBackendStack.ApiUrl      = https://xxxx.execute-api.us-east-1.amazonaws.com
PixelRushBackendStack.WsNotifyUrl = wss://yyyy.execute-api.us-east-1.amazonaws.com/prod
```

:::alert{type=success}
把 **ApiUrl** 保存好——模块 6 中你会把它粘贴进游戏，验证自己部署的全链路。
:::

## 2. 构建前端，再部署

把 WebSocket 地址写入前端配置，构建站点，然后部署前端 stack（它会把构建产物
上传到 CloudFront）：

```bash
echo "{ \"wsNotifyUrl\": \"<粘贴-WsNotifyUrl>\" }" > ../frontend/public/config.json
(cd ../frontend && npm run build)
npx cdk deploy PixelRushFrontendStack --require-approval never
```

输出站点地址：

```
PixelRushFrontendStack.SiteUrl = https://zzzz.cloudfront.net
```

:::alert{type=info}
之所以拆成两步、先构建再部署：前端 stack 发布的是 `frontend/dist` 目录，所以
必须先让它存在。（若在构建前就部署前端，CDK 会警告 `frontend/dist not found`
并上传一个空站点。）
:::

:::alert{type=warning}
CloudFront 是全球 CDN——新分发要 **5–10 分钟**才能部署到所有边缘节点。部署命令
刚返回时，打开 **SiteUrl** 可能短暂看到报错或旧缓存页面。若如此，等几分钟再刷新
（强制刷新 ⌘/Ctrl-Shift-R 更有效）。
:::

## 3. 检查点 ★

在浏览器打开 **SiteUrl**：

1. 登录页上，服务器保持默认的 **☁️ AWS ARENA** 即可。在*你自己的* SiteUrl 上，
   它指的就是"本站点自己的后端"——也就是你刚部署的那个。（**🔧 MY SERVER**
   选项用于把*别人的*前端指向你的后端，模块 6 才会用到，这里不用。）
2. 输入任意车手名 + workshop 密码 `gamelift` → **START ENGINE**
3. 进入大厅，作为 1 级新手，随机获得一辆车和金币余额
4. 逛逛**车库**和**商店**——金币够的话买辆车！

:::alert{type=info}
试试点 **RACE → 任选赛道 → 2P**：匹配会永远转圈。这是预期的——现在还没有任何
游戏服务器存在。接下来的整个 workshop 就是解决这件事。
:::
