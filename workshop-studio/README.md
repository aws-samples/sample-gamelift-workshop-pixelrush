# Workshop Studio 版本（生成产物）

本目录是 `workshop/`（Hugo 源）转换成 **AWS Workshop Studio 原生格式**的结果，
用于发布到 Workshop Studio（catalog.workshops.aws）。

**不要直接手改本目录的内容页** —— 改 `workshop/content/` 里的 Hugo 源，然后重新生成：

```bash
python3 workshop/scripts/convert-to-workshop-studio.py
```

## 结构

```
contentspec.yaml        Workshop Studio 配置（locale、CFN infrastructure、账号/region 配置）
content/<slug>/index.en.md / index.zh-CN.md   双语页面
static/images/          图片（en/zh 共享）
static/iam/participant-policy.json            参与者最小权限策略
static/infrastructure/workshop-studio.yaml    AWS 活动预置模板（dev machine）
```

## 发布模式

以 **Protected（事件专用）** 模式发布：workshop 不进公开目录，只有讲师创建的
event 的参与者可以访问。这样可以避开 Public 目录的 bar-raising 审核流程，
代码仓库也无需迁移到 aws-samples。

## 发布步骤

1. 在 Workshop Studio 控制台创建 workshop，获得托管 git 仓库
2. 把本目录内容 push 到该仓库 main 分支
3. push 后自动构建 preview，检查 en-US 与 zh-CN 两个 locale
4. 保持 Protected 可见性；办活动时由讲师创建 event，参与者通过 event 链接进入

## 讲师活动前清单

- [ ] 部署官方 AWS ARENA（仓库主 README 的部署流程），拿到 CloudFront SiteUrl
- [ ] 把 SiteUrl 提供给学员（决赛日模块使用；无需长期在线，活动结束 cdk destroy）
- [x] 代码仓库地址已写入 bootstrap 页与 CFN 模板 `RepoUrl`：
      `https://github.com/aws-samples/sample-gamelift-workshop-pixelrush.git`
- [ ] 确认该 GitHub 仓库已 push 最新代码且可公开访问（dev machine 预克隆
      与学员 `git clone` 都依赖它）

## 遗留 TODO

- [ ] 各模块检查点补控制台截图
- [ ] 若将来要进 Public 目录：需要 aws-samples 仓库 + bar-raising/安全/品牌审核
