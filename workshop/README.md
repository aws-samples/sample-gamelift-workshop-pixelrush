# GameLift Workshop（Hugo 站点源）

本目录是 workshop 教程站点的内容源，基于
[aws-modernization-workshop-base](https://github.com/aws-samples/aws-modernization-workshop-base)
模板（Hugo + hugo-theme-learn）。

## 目录

```
workshop/
├── DESIGN.md            设计方案（v3，已评审）
├── config.toml          Hugo 配置（含 en/zh 双语）
├── content/             教程内容，双语（*.en.md / *.zh.md）
│   ├── _index.*.md      首页
│   ├── 1_Introduction/  … 9_Appendix_MultiRegion/
└── static/
    └── infrastructure/
        └── workshop-studio.yaml   Workshop Studio 账号预置 CFN 模板
```

## 本地预览

```bash
# 1. 准备站点骨架（一次性）
mkdir -p /tmp/ws-base/themes && cd /tmp/ws-base
# 注意：base 模板自带的 hugo-theme-learn 已停止维护，与 Hugo ≥0.146 不兼容；
# 本 workshop 的 config.toml 已改用其维护中的兼容分支 relearn：
git clone --depth 1 https://github.com/McShelby/hugo-theme-relearn themes/hugo-theme-relearn

# 2. 用本目录内容覆盖
cp -r /path/to/gamelift-workshop/workshop/content .
cp    /path/to/gamelift-workshop/workshop/config.toml .
mkdir -p static && cp -r /path/to/gamelift-workshop/workshop/static/* static/

# 3. 启动
hugo server -D    # http://localhost:1313，右上角可切换 English/简体中文
```

## 发布

base 模板自带 `webspec.yml`（CodeBuild）：安装 Hugo → `hugo` 构建 → 产物在
`public/`。接入 Amplify Hosting 或 S3+CloudFront 均可。

## 待办（发布前）

- [x] 仓库地址已定：`https://github.com/aws-samples/sample-gamelift-workshop-pixelrush.git`
      （bootstrap 页与 CFN 模板 `RepoUrl` 已替换）
- [x] 1_Introduction 架构图已换成 `gamelift-arch.png`（首页仍为 ASCII，可选优化）
- [ ] 各检查点补充控制台截图（`static/images/`）
- [ ] Workshop Studio 事件配置：把 `workshop-studio.yaml` 注册为事件模板，
      Event Outputs 暴露 CodeServerURL / CodeServerPassword
- [ ] 讲师侧：提前部署官方 AWS ARENA（本仓库主 README 的部署流程），
      将 SiteUrl 写入 6_RaceDay 讲师提示
