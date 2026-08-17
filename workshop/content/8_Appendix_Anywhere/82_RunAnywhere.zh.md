---
title: "动手：跑起来"
weight: 82
---

## 1. 确认 Anywhere fleet 已存在

不需要部署任何东西：`PixelRushGameLiftStack` 始终会创建一个 Anywhere fleet、
一个自定义 location（`custom-pixelrush-dev`），以及与之配套的匹配配置——模块 3 的
`-c stage=ec2` 只是在这些资源**之外**再加上托管 EC2 fleet。可以打开
`infra/lib/gamelift-stack.ts` 看：`AnywhereFleet` 那段在
`if (props.deployEc2Fleet)` 判断之外。

直接从 stack 输出里读出 fleet ID：

```bash
aws cloudformation describe-stacks --stack-name PixelRushGameLiftStack \
  --query "Stacks[0].Outputs[?OutputKey=='AnywhereFleetId'].OutputValue" \
  --output text
```

预期输出——一个 fleet ID，说明这个 fleet 已经在等 compute 加入：

```
fleet-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

{{% notice info %}}
由于本附录不做任何部署，它不会动你的托管 EC2 fleet——模块 3 之后的任何时间点
都可以来做，不会干扰主线。
{{% /notice %}}

## 2. 仅 AWS 活动路径：临时放行你的公网 IP

自己账号/笔记本路径跳过本步骤。

云上开发机默认关闭 TCP/UDP 1935。请在实际运行**游戏浏览器**的设备上，另开一个
浏览器标签访问 [checkip.amazonaws.com](https://checkip.amazonaws.com/)（这是一个
AWS 提供的服务，会显示你的公网 IP 地址），复制显示的 IPv4 地址。不要在
云上 VS Code 终端里运行 `curl`：那样得到的是开发机的 EC2 公网 IP，而不是你浏览器
所在网络的公网出口 IP。

先确认开发机已导出安全组 ID（它来自 `~/.bashrc`，如果终端是在实例初始化完成前
打开的，可能读不到）：

```bash
echo "${DEV_SECURITY_GROUP_ID:?未设置——请新开一个终端，或重新 source ~/.bashrc}"
```

预期：一个形如 `sg-0123456789abcdef0` 的安全组 ID。

然后在云上 VS Code 终端中输入刚才复制的地址：

```bash
read -rp "Your browser network public IPv4: " MY_IP

aws ec2 authorize-security-group-ingress \
  --group-id "$DEV_SECURITY_GROUP_ID" \
  --protocol tcp --port 1935 --cidr "${MY_IP}/32"

aws ec2 authorize-security-group-ingress \
  --group-id "$DEV_SECURITY_GROUP_ID" \
  --protocol udp --port 1935 --cidr "${MY_IP}/32"
```

确认只添加了你的 `/32`：

```bash
aws ec2 describe-security-groups \
  --group-ids "$DEV_SECURITY_GROUP_ID" \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`1935`].[IpProtocol,IpRanges[0].CidrIp]' \
  --output table
```

预期看到 TCP、UDP 各一行，CIDR 都是 `你的IP/32`，绝不能是 `0.0.0.0/0`。

{{% notice warning %}}
切换 VPN 或网络后公网 IP 可能变化。请先撤销旧规则，再使用新地址重复本步骤。
不要为了省事把来源扩大为 `0.0.0.0/0`。
{{% /notice %}}

## 3. 把你的机器注册为 fleet 算力

在仓库根目录运行脚本：

```bash
cd ~/gamelift-workshop      # 仓库根目录
./scripts/run-anywhere.sh
```

{{% notice info %}}
环境变量 `COMPUTE_IP` 是脚本注册这台 compute 时使用的 IP 地址。
**自己账号路径**：不用设置——脚本会回退到 `127.0.0.1`，而游戏浏览器和服务器都在
同一台笔记本上时，这正是你想要的。只有当浏览器在**另一台设备**上时，才需要先设置：
`export COMPUTE_IP=<那台设备能访问到的地址>`。
**AWS 活动路径**：什么都不用设——云上开发机已经把 `COMPUTE_IP`（它自己的公网 IP）
和 `DEV_SECURITY_GROUP_ID`（只指向这台机器的安全组）写进了 `~/.bashrc`。
{{% /notice %}}

观察输出：

```
fleet: fleet-xxxx  compute: your-host-dev  ip: 50.x.x.x  port: 1935
                         └─ RegisterCompute：这台机器加入 fleet
starting server (auth token valid ~15 min)...
InitSDK (Anywhere): fleet=fleet-xxxx host=your-host-dev
Connected to GameLift API Gateway.        ◄─ 主动连出到 GameLift 的 WebSocket
ProcessReady on port 1935; waiting for game sessions
                         └─ 空闲且健康——等待被选中
```

检查 compute 期间让这个终端保持运行。第一行的 `ip:` 就是 `COMPUTE_IP` 实际解析
到的地址——笔记本上是 `127.0.0.1`，AWS 活动现场是云上开发机的公网 IP。

## 4. 检查点 ★

打开 AWS 控制台 → **Amazon GameLift Servers → Fleets →
PixelRushAnywhereFleet → Computes** 页签：

- 你的机器以 compute 名称在列，状态 **Active**
- 显示它的 IP 和 GameLift SDK endpoint

你已经把自己的硬件注册成了 GameLift fleet 算力：GameLift 现在知道这台机器
存在、健康（`ProcessReady` + 心跳）。同一份 Server SDK 代码、同一套生命周期，
换成了你自己的机器——这就是 Anywhere 的价值：**改代码秒级验证，无需等 fleet 激活**。

## 5. 仅 AWS 活动路径：关闭临时游戏端口

完成检查点后立即删除两条规则。服务器主动连向 GameLift 的连接和健康上报不受影响。

第 3 步的服务器还在第一个终端里运行，所以你现在多半是在第二个终端里——那里并没有
`MY_IP` 这个变量。因此不要依赖它，直接从安全组里读回已授权的网段：

```bash
MY_IP_CIDR=$(aws ec2 describe-security-groups \
  --group-ids "$DEV_SECURITY_GROUP_ID" \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`1935`]|[0].IpRanges[0].CidrIp' \
  --output text)
echo "revoking $MY_IP_CIDR"

aws ec2 revoke-security-group-ingress \
  --group-id "$DEV_SECURITY_GROUP_ID" \
  --protocol tcp --port 1935 --cidr "$MY_IP_CIDR"

aws ec2 revoke-security-group-ingress \
  --group-id "$DEV_SECURITY_GROUP_ID" \
  --protocol udp --port 1935 --cidr "$MY_IP_CIDR"
```

如果 `echo` 打印出 `None`，说明规则已经不在了——直接跳到下面的验证步骤。

确认不再存在 1935 规则：

```bash
aws ec2 describe-security-groups \
  --group-ids "$DEV_SECURITY_GROUP_ID" \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`1935`]' \
  --output json
```

预期输出：

```json
[]
```

{{% notice warning %}}
auth token 空闲约 15 分钟后过期。如果后面服务器退出，重新运行
`./scripts/run-anywhere.sh` 即可。Compute Active 检查点只依赖主动出站的 GameLift
管理流量，因此重新运行脚本不需要再次开放入站规则。
{{% /notice %}}
