---
title: "克隆与初始化"
weight: 23
---

## 1. 获取代码

{{% notice info %}}
**AWS 活动（开发机）：** 跳过这一步——仓库已克隆在 `~/gamelift-workshop`，
依赖也已装好。打开终端 `cd ~/gamelift-workshop`，直接跳到第 3 步。
{{% /notice %}}

**仅自己账号** —— 克隆并安装依赖：

```bash
git clone https://github.com/aws-samples/sample-gamelift-workshop-pixelrush.git
cd gamelift-workshop
# workshop/ 和 workshop-studio/ 是教程本身的源码，实验用不到；
# 删掉让目录更清爽（可选）
rm -rf workshop workshop-studio
(cd infra && npm install)
(cd backend && npm install)
(cd frontend && npm install)
```

## 2. 验证工具链

两条路径都做——确认工具就绪：

```bash
node --version && cdk --version && aws sts get-caller-identity
```

## 3. 初始化 CDK

**所有人都要做**——bootstrap 是在**你的 AWS 账号里**创建资源（部署所需的
S3 桶和角色），所以即使在预置好的开发机上也必须执行。每个账号/区域一次：

```bash
cd infra
npx cdk bootstrap
```

预期输出结尾为：

```
 ✅  Environment aws://123456789012/us-east-1 bootstrapped.
```

{{% notice note %}}
这个账号/区域以前 bootstrap 过？命令是幂等的——输出 `(no changes)` 后直接结束。
{{% /notice %}}
