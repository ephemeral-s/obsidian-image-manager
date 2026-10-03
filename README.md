# Image Manager for Obsidian

An Obsidian plugin that organizes pasted images and helps remove image attachments that are no longer referenced by the current note.

[中文说明](#中文说明)

## Features

- Automatically saves pasted images to a configurable folder template.
- Supports `${filename}`, `${date}` (`YYYY-MM-DD`), and `${time}` (`HH-MM-SS`) template variables.
- Generates unique timestamp-based image filenames.
- Provides a command and ribbon button for cleaning unused images from the active note's image folder.
- Shows the files and sizes that will be deleted before asking for confirmation.
- Removes empty image folders after cleanup.
- Supports PNG, JPG, JPEG, GIF, WebP, BMP, and SVG files.

> **Warning:** Cleanup permanently deletes files after confirmation. Back up your vault before using cleanup if you are unsure whether an image is referenced.

## Installation

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub release (or build them from source).
2. Create `.obsidian/plugins/obsidian-image-manager/` in your vault.
3. Copy those files into the new directory.
4. Open **Settings → Community plugins**, enable community plugins if necessary, and enable **Image Manager**.

### Development installation

Clone this repository directly into a vault's `.obsidian/plugins/obsidian-image-manager/` directory, or copy the repository's built plugin files there after building. Enable the plugin in Obsidian's community plugin settings.

## Usage

### Paste an image

1. Open a note in Obsidian.
2. Paste an image from the clipboard.
3. The plugin saves the image using the configured path template and inserts a relative Markdown image link.

The default template is:

```text
images/${filename}/
```

For a note named `Project Plan`, pasted images are saved under `images/Project Plan/` relative to the note's folder.

### Clean unused images

Use either of these actions while the note is active:

- Click the trash icon in the left ribbon.
- Open the command palette (`Ctrl+P` on Windows/Linux or `Cmd+P` on macOS) and run **Clean unused images in current document**.

Review the confirmation dialog before deleting files. The cleanup only considers supported image files below the active note's configured image folder.

### Configure the storage path

Open **Settings → Image Manager** and edit the image storage path template. Available variables:

- `${filename}` — the current note name without its extension
- `${date}` — the current date in `YYYY-MM-DD` format
- `${time}` — the current time in `HH-MM-SS` format

Examples:

```text
images/${filename}/
attachments/${date}/${filename}/
assets/${time}/
```

## Build from source

Requirements: Node.js 18 or newer and npm.

```bash
npm install
npm run build
```

The production build creates `main.js` in the repository root. For development with watch mode:

```bash
npm run dev
```

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugin directory after building.

## Project layout

```text
├── manifest.json       # Obsidian plugin metadata
├── main.js             # Generated production bundle
├── styles.css          # Plugin styles
├── src/main.ts         # TypeScript source
├── esbuild.config.mjs  # Build configuration
└── versions.json       # Supported Obsidian/plugin versions
```

## License

[MIT](LICENSE)

## 中文说明

Image Manager 是一个用于管理 Obsidian 图片附件的插件：粘贴图片时自动保存到可配置的目录，并可扫描当前文档对应的图片目录，确认后删除未使用的图片和空目录。

默认保存路径模板为 `images/${filename}/`，也支持 `${date}` 和 `${time}` 变量。可在 **设置 → Image Manager** 中修改。

> 清理操作会永久删除文件。使用前请确认图片确实未被引用，并建议先备份 Vault。
