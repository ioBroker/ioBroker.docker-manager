import { existsSync, copyFileSync } from 'node:fs';
import { deleteFoldersRecursive, copyFiles, npmInstall, buildReact, patchHtmlFile } from '@iobroker/build-tools';

const SRC_ADMIN = `${__dirname}/src-admin`;
const BUILT_INDEX = `${SRC_ADMIN}/build/index.html`;

function clean(): void {
    deleteFoldersRecursive(`${__dirname}/admin`, ['docker-manager.png', 'docker-manager.svg']);
    deleteFoldersRecursive(`${SRC_ADMIN}/build`);
}

function copyAllFiles(): void {
    copyFiles(['src-admin/build/**/*', '!src-admin/build/index.html'], 'admin/');
}

function copyI18n(): void {
    copyFiles(['src/lib/i18n/**/*'], 'build/lib/i18n');
}

async function buildGui(): Promise<void> {
    await buildReact(`${SRC_ADMIN}/`, { rootDir: __dirname, vite: true });
}

/** Patch the built index.html and publish it as both the config page and the admin tab */
async function patch(): Promise<void> {
    await patchHtmlFile(BUILT_INDEX, '../..');
    if (!existsSync(BUILT_INDEX)) {
        console.error('Index.html not found!');
        process.exit(2);
    }
    copyFileSync(BUILT_INDEX, `${__dirname}/admin/index_m.html`);
    copyFileSync(BUILT_INDEX, `${__dirname}/admin/tab_m.html`);
}

/** The full frontend pipeline, used by `--build` and by the no-argument default */
async function buildAll(): Promise<void> {
    clean();
    await npmInstall(SRC_ADMIN);
    await buildGui();
    copyAllFiles();
    await patch();
}

function fail(message: string): (e: unknown) => never {
    return (e: unknown): never => {
        console.error(`${message}: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
    };
}

if (process.argv.includes('--0-clean')) {
    clean();
} else if (process.argv.includes('--1-npm')) {
    npmInstall(SRC_ADMIN).catch(fail('Cannot install npm'));
} else if (process.argv.includes('--2-build')) {
    buildGui().catch(fail('Cannot build react'));
} else if (process.argv.includes('--3-copy')) {
    copyAllFiles();
} else if (process.argv.includes('--4-patch')) {
    patch().catch(fail('Cannot patch'));
} else if (process.argv.includes('--build')) {
    buildAll().catch(fail('Cannot build'));
} else if (process.argv.includes('--copy-i18n')) {
    copyI18n();
} else {
    buildAll().catch(fail('Cannot build admin controls'));
}
