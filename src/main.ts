import { Plugin, TFile, TFolder, Notice, Modal, Setting, App, PluginSettingTab } from 'obsidian';

interface ImageManagerSettings {
    imagePathTemplate: string;
}

const DEFAULT_SETTINGS: ImageManagerSettings = {
    imagePathTemplate: 'images/${filename}/'
}

class DeleteConfirmationModal extends Modal {
    private filesToDelete: TFile[];
    private onConfirm: () => void;
    private plugin: ImageManagerPlugin;

    constructor(app: App, filesToDelete: TFile[], onConfirm: () => void, plugin: ImageManagerPlugin) {
        super(app);
        this.filesToDelete = filesToDelete;
        this.onConfirm = onConfirm;
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: '删除未使用的图片' });

        const fileList = contentEl.createDiv({ cls: 'image-manager-file-list' });
        fileList.style.maxHeight = '300px';
        fileList.style.overflowY = 'auto';
        fileList.style.marginBottom = '20px';

        fileList.createEl('p', { text: `发现 ${this.filesToDelete.length} 个未使用的图片文件：` });

        this.filesToDelete.forEach(file => {
            const fileSize = (file.stat.size / 1024).toFixed(2) + 'KB';
            const fileItem = fileList.createDiv({ cls: 'image-manager-file-item' });
            fileItem.style.padding = '5px 0';
            fileItem.style.borderBottom = '1px solid var(--background-modifier-border)';
            const fileName = fileItem.createEl('strong', { text: file.name });
            fileName.createSpan({
                text: ` (${fileSize})`,
                attr: { style: 'color: var(--text-muted);' }
            });
        });

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonContainer.style.marginTop = '20px';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '10px';

        const cancelButton = buttonContainer.createEl('button', { text: '取消', cls: 'mod-cancel' });
        cancelButton.onclick = () => this.close();

        const deleteButton = buttonContainer.createEl('button', {
            text: '删除',
            cls: 'mod-warning'
        });
        deleteButton.onclick = () => {
            this.onConfirm();
            this.close();
        };
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export default class ImageManagerPlugin extends Plugin {
    settings: ImageManagerSettings;

    async onload() {
        console.log('Loading Image Manager Plugin');

        await this.loadSettings();

        // Register the cleanup command
        this.addCommand({
            id: 'cleanup-unused-images',
            name: '清理当前文档的未使用图片',
            callback: () => this.cleanupUnusedImages()
        });

        // Add ribbon icon for quick cleanup
        this.addRibbonIcon('trash', '清理未使用的图片', (evt: MouseEvent) => {
            this.cleanupUnusedImages();
        });

        // Register paste event handler
        this.registerEvent(
            this.app.workspace.on('editor-paste', (evt: ClipboardEvent, editor: any) => {
                this.handlePaste(evt, editor);
            })
        );

        // Add settings tab
        this.addSettingTab(new ImageManagerSettingTab(this.app, this));
    }

    onunload() {
        console.log('Unloading Image Manager Plugin');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async handlePaste(evt: ClipboardEvent, editor: any) {
        const clipboardItems = evt.clipboardData?.items;
        if (!clipboardItems) return;

        // Check for image data in clipboard
        for (let i = 0; i < clipboardItems.length; i++) {
            const item = clipboardItems[i];
            if (item.type.startsWith('image/')) {
                evt.preventDefault();

                const file = item.getAsFile();
                if (!file) return;

                const activeFile = this.app.workspace.getActiveFile();
                if (!activeFile) {
                    new Notice('没有活动的文档');
                    return;
                }

                await this.saveImageToFile(file, activeFile, editor);
                break;
            }
        }
    }

    async saveImageToFile(imageFile: File, activeFile: TFile, editor: any) {
        try {
            // Generate folder path
            const folderPath = this.getImageFolderPath(activeFile);

            // Ensure folder path exists with recursive creation
            await this.ensureFolderExists(folderPath);

            // Generate unique filename
            const timestamp = Date.now();
            const ext = imageFile.name.split('.').pop() || 'png';
            const uniqueFilename = `${timestamp}.${ext}`;
            const imagePath = `${folderPath}/${uniqueFilename}`;

            // Save the image
            const arrayBuffer = await imageFile.arrayBuffer();
            await this.app.vault.createBinary(imagePath, arrayBuffer);

            // Insert image link at cursor position
            const relativePath = this.getRelativePath(activeFile.path, imagePath);
            const imageMarkdown = `![](${this.escapeMarkdownPath(relativePath)})`;

            const cursor = editor.getCursor();
            editor.replaceRange(imageMarkdown, cursor);

            new Notice(`图片已保存到 ${imagePath}`);
        } catch (error) {
            console.error('Error saving image:', error);
            new Notice('保存图片失败: ' + error.message);
        }
    }

    async ensureFolderExists(folderPath: string) {
        // Split path into parts and create folders recursively
        const parts = folderPath.split('/');
        let currentPath = '';

        for (const part of parts) {
            if (!part) continue; // Skip empty parts

            currentPath = currentPath ? `${currentPath}/${part}` : part;

            const folder = this.app.vault.getAbstractFileByPath(currentPath);
            if (folder && folder instanceof TFile) {
                throw new Error(`路径已存在文件: ${currentPath}`);
            }

            if (!folder) {
                console.log(`Creating folder: "${currentPath}"`);
                await this.app.vault.createFolder(currentPath);
            }
        }
    }

    escapeMarkdownPath(path: string): string {
        // Encode special characters for Markdown, specifically spaces
        return path.replace(/ /g, '%20');
    }

    getImageFolderPath(file: TFile): string {
        // Get the parent folder of the file
        const parentPath = file.parent ? file.parent.path : '';

        // Generate path from template
        const filenameWithoutExt = file.basename;
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');

        let folderPath = this.settings.imagePathTemplate
            .replace('${filename}', filenameWithoutExt)
            .replace('${date}', dateStr)
            .replace('${time}', timeStr);

        // Normalize path separators and clean up
        folderPath = folderPath.replace(/\\/g, '/'); // Convert backslashes to forward slashes

        // Remove duplicate slashes but keep spaces intact
        folderPath = folderPath.replace(/\/+/g, '/');

        // Remove leading and trailing slashes
        folderPath = folderPath.replace(/^\/|\/$/g, '');

        // Prepend parent folder path if exists
        if (parentPath) {
            folderPath = `${parentPath}/${folderPath}`;
        }

        // Final cleanup to ensure no double slashes
        folderPath = folderPath.replace(/\/+/g, '/');

        return folderPath;
    }

    getRelativePath(fromPath: string, toPath: string): string {
        const fromParts = fromPath.split('/');
        const toParts = toPath.split('/');

        // Find common prefix
        let commonLength = 0;
        while (commonLength < fromParts.length - 1 &&
               commonLength < toParts.length &&
               fromParts[commonLength] === toParts[commonLength]) {
            commonLength++;
        }

        // Calculate relative path
        const upCount = (fromParts.length - 1) - commonLength;
        const upPath = upCount > 0 ? Array(upCount).fill('..').join('/') : '';
        const downPath = toParts.slice(commonLength).join('/');

        if (upPath && downPath) {
            return `${upPath}/${downPath}`;
        } else if (upPath) {
            return upPath;
        } else if (downPath) {
            return downPath;
        } else {
            return '';
        }
    }

    async cleanupUnusedImages() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('没有活动的文档');
            return;
        }

        // Get document content
        const content = await this.app.vault.read(activeFile);

        // Extract all image links from the document
        const imageLinks = new Set<string>();
        const linkRegex = /!\[.*?\]\((.*?)\)/g;
        let match;

        while ((match = linkRegex.exec(content)) !== null) {
            let imagePath = match[1];

            // Get absolute path for the image link
            const absolutePath = this.getAbsolutePath(activeFile.path, imagePath);
            if (absolutePath) {
                imageLinks.add(absolutePath);
            }
        }

        // Generate folder path using the same logic as saveImageToFile
        const folderPath = this.getImageFolderPath(activeFile);
        console.log(`Cleanup: Looking for images in folder: "${folderPath}"`);

        // Get all image files in the folder
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
            new Notice(`未找到图片文件夹: ${folderPath}`);
            return;
        }

        const filesToDelete: TFile[] = [];
        if (folder instanceof TFile) {
            new Notice('路径指向的是文件而不是文件夹');
            return;
        }

        const allFiles = this.app.vault.getFiles();
        const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

        // Find image files in the folder
        const folderImageFiles = allFiles.filter(file => {
            const ext = file.extension?.toLowerCase();
            return ext && imageExtensions.includes(ext) && file.path.startsWith(folderPath + '/');
        });

        console.log(`Cleanup: Found ${folderImageFiles.length} image files in folder`);

        // Also try to match with URL-encoded paths (spaces as %20)
        const folderImageFilesEncoded = allFiles.filter(file => {
            const ext = file.extension?.toLowerCase();
            return ext && imageExtensions.includes(ext) && file.path.startsWith(folderPath + '/') &&
                   !imageLinks.has(file.path);
        });

        console.log(`Cleanup: Total image files to check: ${folderImageFiles.length}`);

        // Find unused images
        for (const file of folderImageFiles) {
            if (!imageLinks.has(file.path)) {
                filesToDelete.push(file);
            }
        }

        if (filesToDelete.length === 0) {
            new Notice('没有发现未使用的图片');
            return;
        }

        // Show confirmation dialog
        new DeleteConfirmationModal(
            this.app,
            filesToDelete,
            async () => {
                // Delete the files
                for (const file of filesToDelete) {
                    await this.app.vault.delete(file);
                }
                new Notice(`已删除 ${filesToDelete.length} 个未使用的图片`);

                // Clean up empty folders after deletion
                await this.cleanupEmptyFolders(folderPath);
            },
            this
        ).open();
    }

    async cleanupEmptyFolders(folderPath: string) {
        try {
            // Check if the image folder is empty
            const folder = this.app.vault.getAbstractFileByPath(folderPath);
            if (folder && folder instanceof TFolder) {
                const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
                const children = folder.children;
                const hasImages = children.some(child => {
                    if (child instanceof TFile) {
                        const ext = child.extension?.toLowerCase();
                        return ext && imageExtensions.includes(ext);
                    }
                    return false;
                });

                // If no images in the folder, delete it
                if (!hasImages && children.length === 0) {
                    await this.app.vault.delete(folder);
                    new Notice(`已删除空文件夹: ${folderPath}`);

                    // Try to delete the parent 'images' folder if it's now empty
                    const folderParts = folderPath.split('/');
                    if (folderParts.length >= 2 && folderParts[folderParts.length - 2] === 'images') {
                        const parentFolderPath = folderParts.slice(0, -1).join('/');
                        await this.tryDeleteParentImagesFolder(parentFolderPath);
                    }
                }
            }
        } catch (error) {
            console.error('Error cleaning up folders:', error);
        }
    }

    async tryDeleteParentImagesFolder(imagesFolderPath: string) {
        try {
            const folder = this.app.vault.getAbstractFileByPath(imagesFolderPath);
            if (folder && folder instanceof TFolder) {
                // Check if there are any image files in subfolders
                const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
                const hasImagesInSubfolders = folder.children.some(child => {
                    if (child instanceof TFolder) {
                        // Check if this subfolder contains any images
                        const allFiles = this.app.vault.getFiles();
                        return allFiles.some(f => {
                            if (f.path.startsWith(child.path + '/')) {
                                const ext = f.extension?.toLowerCase();
                                return ext && imageExtensions.includes(ext);
                            }
                            return false;
                        });
                    }
                    return false;
                });

                // If no images in subfolders and no images directly in the folder, delete it
                const hasImagesDirectly = folder.children.some(child =>
                    child instanceof TFile && imageExtensions.includes(child.extension?.toLowerCase() || '')
                );

                if (!hasImagesInSubfolders && !hasImagesDirectly) {
                    await this.app.vault.delete(folder);
                    new Notice(`已删除空的images文件夹: ${imagesFolderPath}`);
                }
            }
        } catch (error) {
            console.error('Error deleting parent images folder:', error);
        }
    }

    getAbsolutePath(fromPath: string, relativePath: string): string | null {
        if (!relativePath) return null;

        // If already absolute (starts with /), return it
        if (relativePath.startsWith('/')) {
            return relativePath.substring(1);
        }

        // Decode URL-encoded paths (e.g., %20 to space)
        const decodedRelativePath = decodeURIComponent(relativePath);

        const fromParts = fromPath.split('/');
        const relParts = decodedRelativePath.split('/');

        let result = [];
        let upCount = 0;

        for (const part of relParts) {
            if (part === '..') {
                upCount++;
            } else if (part !== '.') {
                result.push(part);
            }
        }

        const baseParts = fromParts.slice(0, fromParts.length - 1 - upCount);
        if (baseParts.length + upCount < fromParts.length - 1) {
            console.log(`getAbsolutePath: Invalid relative path - fromPath: ${fromPath}, relativePath: ${relativePath}`);
            return null; // Too many .. levels
        }

        const absolutePath = [...baseParts, ...result].join('/');
        console.log(`getAbsolutePath: fromPath: ${fromPath}, relativePath: ${relativePath} => ${absolutePath}`);
        return absolutePath;
    }
}

class ImageManagerSettingTab extends PluginSettingTab {
    plugin: ImageManagerPlugin;

    constructor(app: App, plugin: ImageManagerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();


        new Setting(containerEl)
            .setName('图片存储路径模板')
            .setDesc('图片保存的路径模板。可用变量: ${filename} (文档名), ${date} (日期), ${time} (时间)')
            .addText(text => text
                .setPlaceholder('images/${filename}/')
                .setValue(this.plugin.settings.imagePathTemplate)
                .onChange(async (value) => {
                    this.plugin.settings.imagePathTemplate = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: '使用说明' });
        containerEl.createEl('p', { text: '1. 粘贴图片时，会自动保存到指定路径' });
        containerEl.createEl('p', { text: '2. 点击左侧边栏的垃圾桶图标，或使用 Ctrl/Cmd+P 打开命令面板，选择"清理当前文档的未使用图片"来清理未使用的图片' });
        containerEl.createEl('p', { text: '3. 清理图片后，如果图片文件夹为空，会自动删除该文件夹和空的images文件夹' });
    }
}
