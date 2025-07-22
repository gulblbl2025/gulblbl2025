import './loadEnv.js';
import './patches.js';
import Utility from "./Utility.js";
import os from 'os';
import puppeteer, { ElementHandle, Page } from 'puppeteer';
import logger from './logger.js';
import { authenticator } from 'otplib';
import path from 'path';
import fs from 'fs';

(async () => {
    const { GITHUB_USERNAME, GITHUB_PASSWORD, GITHUB_SECRET, GITHUB_STEP_SUMMARY, DELETE_REPO, REMOTE, STRESS_TEST, RUN_CIRCLECI_SETUP, Stop_All_PIPELINES } = process.env;

    if (!GITHUB_USERNAME || !GITHUB_PASSWORD || !GITHUB_SECRET) {
        logger.error("环境变量未配置");
        return;
    }

    const headless = os.platform() == 'linux';

    const browser = await puppeteer.launch({
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

    async function createGithubIssueWithScreenshot(page: Page) {
        await page.bringToFront();

        const path = `${Date.now()}.png` as `${string}.png`;
        await page.screenshot({ path, fullPage: true });

        const newIssueUrl = "https://github.com/mirllan2025/mirllan2025/issues/new";
        await page.goto(newIssueUrl);
        await page.type("//input[@placeholder='Title']", "");
        const input = await page.$x("//input[@type='file']", { visible: false }) as ElementHandle<HTMLInputElement>;
        await input.uploadFile(path);

        const imageUrl = await Utility.waitForFunction(async () => {
            const text = await page.textContent("xpath=//textarea[@placeholder='Type your description here…']");
            const match = text.match(/https:\/\/github\.com\/user-attachments\/assets\/[a-zA-Z0-9\-]+/);
            if (match)
                return match[0];
        });

        if (GITHUB_STEP_SUMMARY) {
            const mdContent = `![图片](${imageUrl})\n`;
            fs.appendFileSync(GITHUB_STEP_SUMMARY, mdContent, { encoding: 'utf-8' });
        }
    }

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

        const pages = await browser.pages();
        for (const page of pages) {
            await createGithubIssueWithScreenshot(page);
        }

        process.exit(1);
    });

    const [page] = await browser.pages();
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

    async function updateFile(source: string, target: string = source) {
        await page.goto(`https://github.com/${username}/${repoName}/upload/main/${path.dirname(target)}`);
        const input = await page.waitForSelector('#upload-manifest-files-input') as ElementHandle<HTMLInputElement>;
        await input.uploadFile(source);
        logger.info("正在上传");
        await page.$x("//div[contains(@class, 'js-upload-progress')]");
        await page.$x("//div[contains(@class, 'js-upload-progress')]", { timeout: 60_000, hidden: true });
        await (await page.$x("//button[normalize-space(text())='Commit changes']")).click();
        await page.waitForNavigation();
        logger.info(`上传成功 ${source} => ${target}`);

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

    if (!await page.goto(`https://github.com/${username}/${repoName}/settings`, { retries: 1 })) {
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
        await updateFile(".github/workflows/ci.yml");
        // await updateFile("frpc.exe");
    }

    REMOTE && await updateFile(".circleci/config.yml");
    STRESS_TEST && await updateFile(".circleci/job-sync.yml", ".circleci/config.yml");

    if (RUN_CIRCLECI_SETUP || Stop_All_PIPELINES) {
        const circleciPage = await browser.newPage();
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

        if (RUN_CIRCLECI_SETUP) {
            const getStartedElement = await circleciPage.$x("//h3[contains(text(), 'Get Started')]", { retries: 1 });
            if (getStartedElement) {
                logger.info("设置项目");
                await getStartedElement.click();
                await circleciPage.waitForNavigation();

                await Utility.waitForSeconds(1);
                await circleciPage.click("//button[@data-cy='project-button' and text()='Set up']");
                await circleciPage.type("//input[@type='search' and not(@placeholder)]", "main");
                await circleciPage.click("//button[text()='Set Up Project' and not(@disabled)]");
            }
            else {
                logger.info("已经设置过了");
            }
        }
        else {
            logger.info("停止所有");
            await circleciPage.goto(`https://app.circleci.com/pipelines/github/${username}`);
            await circleciPage.$x("//span[contains(text(),'All Pipelines')]");
            const buttons = await circleciPage.$$("//button[contains(@aria-label, 'RUNNING workflow')]/ancestor::div//button[contains(@aria-label, 'Cancel workflow')]");
            logger.info("可取消工作流数量", buttons.length);
            for (const button of buttons) {
                button.click();
            }
        }
    }

    if (os.platform() == 'linux')
        await browser.close();

    logger.info("完成");
})();