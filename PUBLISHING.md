# 发布指南

Terminal Projects 使用 VS Code 原生终端 API。为便于插件市场向不同系统分发，项目仍为四个目标平台分别构建并发布 VSIX。

## 首次准备

1. 打开 [Visual Studio Marketplace 发布者管理页](https://marketplace.visualstudio.com/manage)，使用 Microsoft 账号登录并创建发布者。
2. 发布者 ID 必须与 `package.json` 的 `publisher` 完全一致。当前预设为 `opdify`；如果实际 ID 不同，必须在首次发布前修改。
3. 确认版本号、`CHANGELOG.md` 和 README 已更新，并确保 Git 工作区干净。

## 构建平台包

推送 `v*` 标签后，GitHub Actions 的 `Package platform VSIX files` 工作流会分别生成：

- `linux-x64`
- `darwin-x64`
- `darwin-arm64`
- `win32-x64`

从该工作流下载四个 artifacts。也可以在对应操作系统中手动执行：

```bash
npm ci
npm run check
npm test
npm run build
npx vsce package --target <target> --out terminal-projects-<target>.vsix
```

## 首次发布

最直观的首发方式是在发布者管理页选择 `New extension` → `Visual Studio Code`，逐一上传同一版本的各平台 VSIX。

也可以使用 `vsce`。在 Azure DevOps 创建具备 Marketplace `Manage` 权限的凭据后：

```bash
npx vsce login opdify
npx vsce publish --packagePath terminal-projects-linux-x64.vsix
npx vsce publish --packagePath terminal-projects-darwin-x64.vsix
npx vsce publish --packagePath terminal-projects-darwin-arm64.vsix
npx vsce publish --packagePath terminal-projects-win32-x64.vsix
```

如果发布者 ID 不是 `opdify`，登录命令和 `package.json` 都要使用实际 ID。

## 后续版本

按语义化版本更新版本号，不让 `vsce publish` 自动创建提交，以免绕开仓库的提交信息规范：

```bash
npm version patch --no-git-tag-version
npm install
```

更新 `CHANGELOG.md`，通过检查后提交，然后创建并推送与版本号一致的标签，例如：

```bash
git tag v0.1.1
git push origin main --follow-tags
```

标签触发平台构建。下载产物并按上一节发布四个平台包。

> Microsoft 已宣布 Azure DevOps 全局 PAT 将于 2026-12-01 退役。PAT 适合当前首次手动发布，但长期自动发布应迁移到 Microsoft Entra ID 的工作负载身份联合或托管身份。
