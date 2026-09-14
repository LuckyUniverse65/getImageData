"use strict";

const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {spawn, spawnSync} = require("node:child_process");

const EXPECTED_VALUES = 48 * 48 * 4;

function findChrome() {
    const candidates = [
        process.env.CHROME_PATH,
        path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
        path.join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
        path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe")
    ].filter(Boolean);
    const chromePath = candidates.find(candidate => fs.existsSync(candidate));
    if (!chromePath) {
        throw new Error("Google Chrome was not found; set CHROME_PATH to chrome.exe");
    }
    return chromePath;
}

function getChromeVersion(chromePath) {
    if (process.platform !== "win32") {
        const result = spawnSync(chromePath, ["--version"], {
            encoding: "utf8",
            timeout: 10000
        });
        if (result.error) throw result.error;
        const output = result.stdout.trim();
        const match = output.match(/\d+(?:\.\d+){3}/);
        return match ? match[0] : output;
    }

    const result = spawnSync("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "(Get-Item -LiteralPath $env:CANVAS_CHROME_EXE).VersionInfo.ProductVersion"
    ], {
        encoding: "utf8",
        timeout: 10000,
        windowsHide: true,
        env: {...process.env, CANVAS_CHROME_EXE: chromePath}
    });
    if (result.error) throw result.error;
    if (result.status !== 0 || !result.stdout.trim()) {
        throw new Error(`Could not read the Chrome version: ${(result.stderr || "unknown error").trim()}`);
    }
    return result.stdout.trim();
}

function readLocalPixels() {
    const result = spawnSync(process.execPath, [path.join(__dirname, "data.js")], {
        cwd: __dirname,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        timeout: 30000,
        windowsHide: true
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`data.js exited with status ${result.status}: ${result.stderr.trim()}`);
    }

    const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
    const pixels = line ? line.split(",").map(Number) : [];
    if (pixels.length !== EXPECTED_VALUES || pixels.some(value => !Number.isInteger(value))) {
        throw new Error(`data.js returned ${pixels.length} values; expected ${EXPECTED_VALUES}`);
    }
    return pixels;
}

function reservePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const {port} = server.address();
            server.close(error => error ? reject(error) : resolve(port));
        });
    });
}

function delay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function fetchJson(url) {
    const response = await fetch(url, {signal: AbortSignal.timeout(1000)});
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return response.json();
}

async function waitForDevTools(port, pageUrl) {
    let lastError;
    for (let attempt = 0; attempt < 150; attempt++) {
        try {
            const [version, pages] = await Promise.all([
                fetchJson(`http://127.0.0.1:${port}/json/version`),
                fetchJson(`http://127.0.0.1:${port}/json/list`)
            ]);
            const page = pages.find(entry => entry.type === "page" && entry.url === pageUrl)
                || pages.find(entry => entry.type === "page");
            if (version.webSocketDebuggerUrl && page && page.webSocketDebuggerUrl) {
                return {browserSocket: version.webSocketDebuggerUrl, pageSocket: page.webSocketDebuggerUrl};
            }
        } catch (error) {
            lastError = error;
        }
        await delay(100);
    }
    throw new Error(`Chrome DevTools did not become ready: ${lastError || "timeout"}`);
}

function cdpCommand(socketUrl, method, params = {}) {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(socketUrl);
        const id = 1;
        const timer = setTimeout(() => {
            socket.close();
            reject(new Error(`CDP command timed out: ${method}`));
        }, 10000);

        socket.addEventListener("open", () => {
            socket.send(JSON.stringify({id, method, params}));
        });
        socket.addEventListener("message", event => {
            const message = JSON.parse(String(event.data));
            if (message.id !== id) return;
            clearTimeout(timer);
            socket.close();
            if (message.error) reject(new Error(`${method}: ${message.error.message}`));
            else resolve(message.result);
        });
        socket.addEventListener("error", () => {
            clearTimeout(timer);
            reject(new Error(`CDP connection failed: ${method}`));
        });
    });
}

async function readBrowserPixels(port, pageUrl) {
    let lastError;
    for (let attempt = 0; attempt < 100; attempt++) {
        try {
            const pages = await fetchJson(`http://127.0.0.1:${port}/json/list`);
            const page = pages.find(entry => entry.type === "page" && entry.url === pageUrl)
                || pages.find(entry => entry.type === "page");
            if (!page || !page.webSocketDebuggerUrl) throw new Error("Chrome page target is unavailable");
            const response = await cdpCommand(page.webSocketDebuggerUrl, "Runtime.evaluate", {
                expression: "JSON.stringify(globalThis.data)",
                returnByValue: true
            });
            const value = response.result && response.result.value;
            if (typeof value === "string") {
                const pixels = JSON.parse(value);
                if (Array.isArray(pixels) && pixels.length === EXPECTED_VALUES) return pixels;
            }
        } catch (error) {
            lastError = error;
        }
        await delay(100);
    }
    throw new Error(`demo.js did not produce browser pixels: ${lastError || "timeout"}`);
}

async function readPageText(port, pageUrl, expression = "document.body.innerText") {
    let lastError;
    for (let attempt = 0; attempt < 100; attempt++) {
        try {
            const pages = await fetchJson(`http://127.0.0.1:${port}/json/list`);
            const page = pages.find(entry => entry.type === "page" && entry.url === pageUrl);
            if (!page || !page.webSocketDebuggerUrl) throw new Error("page target is unavailable");
            const response = await cdpCommand(page.webSocketDebuggerUrl, "Runtime.evaluate", {
                expression,
                returnByValue: true
            });
            const value = response.result && response.result.value;
            if (typeof value === "string" && value.length > 0) return value;
        } catch (error) {
            lastError = error;
        }
        await delay(100);
    }
    throw new Error(`Could not read ${pageUrl}: ${lastError || "timeout"}`);
}

async function waitForExit(child, timeout) {
    if (child.exitCode !== null) return;
    await Promise.race([
        new Promise(resolve => child.once("exit", resolve)),
        delay(timeout)
    ]);
}

async function captureVisibleChrome(chromePath) {
    const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-visible-chrome-"));
    const inheritUserVariations = !process.argv.includes("--clean-profile") ||
        process.argv.includes("--inherit-user-variations");
    if (inheritUserVariations) {
        const userDataPath = path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "User Data");
        fs.copyFileSync(path.join(userDataPath, "Local State"), path.join(profilePath, "Local State"));
        for (const fileName of ["VariationsSeedV2", "VariationsSafeSeedV2"]) {
            const sourcePath = path.join(userDataPath, fileName);
            if (fs.existsSync(sourcePath)) {
                fs.copyFileSync(sourcePath, path.join(profilePath, fileName));
            }
        }
        const defaultPath = path.join(profilePath, "Default");
        fs.mkdirSync(defaultPath);
        for (const fileName of ["Preferences", "Secure Preferences"]) {
            const sourcePath = path.join(userDataPath, "Default", fileName);
            if (fs.existsSync(sourcePath)) {
                fs.copyFileSync(sourcePath, path.join(defaultPath, fileName));
            }
        }
    }
    const port = await reservePort();
    const useNewTabPage = !process.argv.includes("--file-page") ||
        process.argv.includes("--new-tab-page");
    const pageUrl = useNewTabPage
        ? "chrome://new-tab-page/"
        : pathToFileURL(path.join(__dirname, "test.html")).href;
    const child = spawn(chromePath, [
        `--user-data-dir=${profilePath}`,
        `--remote-debugging-port=${port}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--new-window",
        pageUrl
    ], {
        // Keep Chrome's DLL search path independent from webgl.node's local ANGLE DLLs.
        cwd: path.dirname(chromePath),
        stdio: "ignore",
        windowsHide: false
    });

    let browserSocket;
    try {
        const sockets = await waitForDevTools(port, pageUrl);
        browserSocket = sockets.browserSocket;
        if (useNewTabPage) {
            const demoSource = fs.readFileSync(path.join(__dirname, "demo.js"), "utf8");
            await cdpCommand(sockets.pageSocket, "Runtime.evaluate", {
                expression: `(()=>{${demoSource}})()`
            });
        }
        const [pixels, gpuInfo] = await Promise.all([
            readBrowserPixels(port, pageUrl),
            cdpCommand(browserSocket, "SystemInfo.getInfo")
        ]);
        let activeVariations;
        if (process.argv.includes("--active-variations")) {
            await cdpCommand(browserSocket, "Target.createTarget", {url: "chrome://version/"});
            activeVariations = await readPageText(
                port,
                "chrome://version/",
                "atob(document.querySelector('#variations-cmd').dataset.value)"
            );
        }
        if (process.argv.includes("--hold")) await delay(120000);
        return {pixels, gpuInfo, activeVariations};
    } finally {
        if (browserSocket) {
            try {
                await cdpCommand(browserSocket, "Browser.close");
            } catch {
                child.kill();
            }
        } else {
            child.kill();
        }
        await waitForExit(child, 5000);
        if (child.exitCode === null) child.kill();
        fs.rmSync(profilePath, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
    }
}

function comparePixels(localPixels, browserPixels, chromeVersion) {
    const values = Math.max(localPixels.length, browserPixels.length);
    let mismatches = 0;
    let absoluteDifference = 0;
    let alphaDifference = 0;
    let colorDifference = 0;

    for (let index = 0; index < values; index++) {
        const localValue = localPixels[index];
        const browserValue = browserPixels[index];
        if (localValue === browserValue) continue;

        mismatches++;
        const difference = localValue === undefined || browserValue === undefined
            ? 255
            : Math.abs(localValue - browserValue);
        absoluteDifference += difference;
        if (index % 4 === 3) alphaDifference += difference;
        else colorDifference += difference;
    }

    return {
        chromeVersion,
        browserMode: "windowed",
        values,
        mismatches,
        absoluteDifference,
        alphaDifference,
        colorDifference,
        equal: localPixels.length === browserPixels.length && mismatches === 0
    };
}

async function main() {
    const chromePath = findChrome();
    const chromeVersion = getChromeVersion(chromePath);
    const localPixels = readLocalPixels();
    const inputIndex = process.argv.indexOf("--browser-input");
    const browserCapture = inputIndex === -1
        ? await captureVisibleChrome(chromePath)
        : {pixels: JSON.parse(fs.readFileSync(path.resolve(process.argv[inputIndex + 1]), "utf8"))};
    const browserPixels = browserCapture.pixels;
    if (process.argv.includes("--gpu-info") && browserCapture.gpuInfo) {
        console.log(JSON.stringify(browserCapture.gpuInfo));
    }
    if (process.argv.includes("--active-variations") && browserCapture.activeVariations) {
        console.log(browserCapture.activeVariations);
    }
    const outputIndex = process.argv.indexOf("--browser-output");
    if (outputIndex !== -1) {
        const outputPath = process.argv[outputIndex + 1];
        if (!outputPath) throw new Error("--browser-output requires a file path");
        fs.writeFileSync(path.resolve(outputPath), JSON.stringify(browserPixels));
    }
    const result = comparePixels(localPixels, browserPixels, chromeVersion);

    console.log(result.equal);
    console.log(JSON.stringify(result));
    if (!result.equal) process.exitCode = 1;
}

main().catch(error => {
    console.error(error && error.stack || error);
    process.exitCode = 1;
});
