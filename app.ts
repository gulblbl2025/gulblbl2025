import './loadEnv.js';
import './patches.js';
import Utility from "./Utility.js";
import os from 'os';
import puppeteer, { ElementHandle, Page } from 'puppeteer';
import logger from './logger.js';
import { authenticator } from 'otplib';
import fs from 'fs';
import path from 'path';
import clipboardy from 'clipboardy';

(async () => {
    process.on('SIGTERM', async () => {
        // docker-compose down/stop 会触发 SIGTERM 信号
        logger.info('SIGTERM: 终止请求');
        process.exit();
    });

    process.on("uncaughtException", (e: Error) => {
        logger.error("未捕获的异常", e);
    });

    process.on("unhandledRejection", async (e: Error) => {
        logger.error("未处理的拒绝", e);
    });

    const headless = os.platform() == 'linux';

    const chrome = await puppeteer.launch({
        // browser: "firefox",
        headless,
        defaultViewport: null,//自适应
        slowMo: 10,
        args: [
            '--lang=en-US',
            '--window-size=1920,1080',
            '--disable-blink-features=AutomationControlled',
            // headless 模式下，Puppeteer 的默认 User-Agent 会包含 "HeadlessChrome" 字样，容易被识别为机器人。
            // '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-zygote',
            '--disable-gpu',
            '--disable-extensions-file-access-check',
            '--disable-extensions-http-throttling'
        ]
    });

    const { GITHUB_USERNAME, GITHUB_PASSWORD, GITHUB_SECRET, DELETE_REPO, COMMIT_CHANGES } = process.env;

    const [page] = await chrome.pages();
    await page.goto("https://github.com/login");

    await (await page.$x("//input[@id='login_field']")).type(GITHUB_USERNAME);
    await (await page.$x("//input[@id='password']")).type(GITHUB_PASSWORD);
    await (await page.$x("//input[@value='Sign in']")).click();

    await (await page.$x("//input[@id='app_totp']")).type(authenticator.generate(GITHUB_SECRET));

    await (await page.$x("//button[@aria-label='Open user navigation menu']")).click();
    logger.info("登录成功");

    await page.goto("https://github.com/settings/profile");
    const href = await (await page.$x("//h1[@id='settings-header']/a")).evaluate(el => (el as HTMLAnchorElement).href);
    const username = href.split("/").pop();
    logger.info("用户名", username);

    const repoName = "Signal-Server";

    if (DELETE_REPO && await page.goto(`https://github.com/${username}/${repoName}/settings`, { retries: 1 })) {
        await (await page.$x("//button[@id='dialog-show-repo-delete-menu-dialog']")).click();
        await (await page.$x("//button[@id='repo-delete-proceed-button']")).click();
        await (await page.$x("//button[@id='repo-delete-proceed-button']")).click();
        const confirmText = await page.textContent("//label[@for='verification_field']");
        const match = confirmText.match(/["']([^"']+)["']/);
        await (await page.$x("//input[@id='verification_field']")).type(match[1]);
        await (await page.$x("//button[@id='repo-delete-proceed-button' and not(@disabled)]")).click();
        await page.waitForNavigation();
    }

    if (COMMIT_CHANGES && !await page.goto(`https://github.com/${username}/${repoName}/settings`, { retries: 1 })) {
        await page.goto(`https://github.com/signalapp/${repoName}`);
        await (await page.$x("//a[@id='fork-button']")).click();
        await page.$x("//span[@id='RepoNameInput-is-available']");
        await (await page.$x("//button[.//span[contains(text(),'Create fork')]]")).click();

        const url = `https://github.com/${username}/${repoName}/tree/main/.github/workflows`;
        await page.goto(url);

        const items = await page.$$x("//li[@id='.github/workflows-item']//ul/li//span[1]/span");
        const workflows = await Promise.all(items.map(async el => await el.evaluate(el => el.textContent)));
        for (const workflow of workflows) {
            logger.info(`删除工作流文件 ${workflow}...`);
            await page.goto(`${url}/${workflow}`);
            await (await page.$x("//button[@data-testid='more-file-actions-button-nav-menu-wide']")).click();
            await Utility.waitForSeconds(1);
            await (await page.$x("//a[span[contains(., 'Delete file')]]")).click();
            await (await page.$x("//button[.//span[text()='Commit changes...']]")).click();
            await (await page.$x("//button[.//span[text()='Commit changes']]")).click();
        }

        await page.waitForNavigation();
    }

    if (xxx) {
        const dir = ".github/workflows";
        const files = fs.readdirSync(dir).filter(file => fs.statSync(path.join(dir, file)).isFile()).map(file => path.join(dir, file).replace(/\\/g, '/'));
        files.push("frpc.exe", ".circleci/config.yml");

        // await page.emulateNetworkConditions({
        //     download: (100 * 1024) / 8, // 100kbps
        //     upload: (100 * 1024) / 8,   // 100kbps
        //     latency: 400, // 400ms
        // });

        for (const file of files) {
            if (file.endsWith("remote.yml"))
                continue;

            await page.goto(`https://github.com/${username}/${repoName}/upload/main/${path.dirname(file)}`);
            const input = await page.waitForSelector('#upload-manifest-files-input') as ElementHandle<HTMLInputElement>;
            await input.uploadFile(file);
            logger.info("正在上传");
            await page.$x("//div[contains(@class, 'js-upload-progress')]");
            await page.$x("//div[contains(@class, 'js-upload-progress')]", { timeout: 60_000, hidden: true });
            await (await page.$x("//button[normalize-space(text())='Commit changes']")).click();
            await page.waitForNavigation();
            logger.info("上传成功", file);

            // const textContent = fs.readFileSync(file).toString();

            // if (!await page.goto(`https://github.com/${username}/${repoName}/edit/main/${file}`, { retries: 1 })) {
            //     await page.goto(`https://github.com/${username}/${repoName}/new/main`);
            //     await page.type("//input[@placeholder='Name your file...']", file);
            // }

            // const cmContent = await page.$x("//div[contains(@class, 'cm-editor')]//div[@class='cm-content']");
            // await cmContent.evaluate((el, textContent) => (el as HTMLDivElement).innerText = textContent, textContent);

            // await (await page.$x("//button[.//span[text()='Commit changes...']]")).click();
            // await (await page.$x("//button[.//span[text()='Commit changes']]")).click();
            // await page.waitForNavigation();
        }
    }

    const circleciPage = await chrome.newPage();
    await circleciPage.goto("https://circleci.com/vcs-authorize");
    await circleciPage.bringToFront();
    await (await circleciPage.$x("//button[@data-testid='login-btn']")).click();
    await (await circleciPage.$x("//div[@data-testid='legacy-vcs-dropdown']")).click();
    await (await circleciPage.$x("//a[contains(text(), 'Log in with GitHub')]")).click();

    const authorizeFrame = await circleciPage.waitForFrame(frame => frame.url().startsWith("https://github.com/login/oauth/authorize"), { timeout: 3_000 });
    if (authorizeFrame) {
        await Utility.waitForSeconds(3);
        await (await authorizeFrame.$x("//button[contains(text(), 'Authorize circleci')]")).click();
        logger.info("CircleCI 授权成功");

        if (await circleciPage.$x("//h3[contains(text(), 'Welcome to CircleCI!')]")) {
            for (let i = 1; i <= 3; i++) {
                await circleciPage.click(`(//span[contains(text(), 'Select...')])[${i}]`);
            }
        }

        await circleciPage.click("//button[contains(., 'Let's Go')]");
    }

    await circleciPage.waitForFrame(frame => frame.url() == "https://app.circleci.com/home");

    await (await circleciPage.$x("//div[@data-cy='orgcard']//img[@alt='org avatar']")).click();

    const getStartedElement = await circleciPage.$x("//h3[contains(text(), 'Get Started')]", { retries: 1 });
    if (getStartedElement) {
        await getStartedElement.click();
        await circleciPage.waitForNavigation();

        await Utility.waitForSeconds(1);
        await circleciPage.click("//button[@data-cy='project-button' and text()='Set up']");
        await circleciPage.type("//input[@type='search' and not(@placeholder)]", "main");
        await circleciPage.click("//button[text()='Set Up Project' and not(@disabled)]");
    }

    logger.info("完成");

    // await (await circleciPage.$x("")).click();
    // await (await circleciPage.$x("")).click();
    // await (await circleciPage.$x("")).click();
})();