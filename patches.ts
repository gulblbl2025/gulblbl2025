import util from 'util';
import moment from 'moment';
import path from 'path';
import fs from 'fs';
import retry from 'async-retry';
import { Awaitable, ClickOptions, ElementHandle, Frame, GoToOptions, HTTPResponse, KeyboardTypeOptions, NodeFor, Page, ScreenshotOptions, WaitForOptions, WaitForSelectorOptions, WaitTimeoutOptions } from 'puppeteer';
import logger from './logger.js';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { STATUS_CODES } from 'http';

Date.prototype[util.inspect.custom] = function () {
    return moment(this).format('YYYY-MM-DD HH:mm:ss.SSS');
};

Date.prototype.toString = function () {
    return moment(this).format('YYYY-MM-DD HH:mm:ss.SSS');
};

const originalScreenshot = Page.prototype.screenshot;
Page.prototype.screenshot = function (this: Page, options?: Readonly<ScreenshotOptions>): Promise<Uint8Array> {
    if (options?.path) {
        const dir = path.dirname(options.path);
        fs.mkdirSync(dir, { recursive: true });
    }

    return originalScreenshot.call(this, options);
} as any;

const originalGoto = Page.prototype.goto;
Page.prototype.goto = function (
    this: Page,
    url: string,
    options?: GoToOptions
): Promise<HTTPResponse | null> {
    const retries = options?.retries ?? 3;

    return retry(async (_, attempt) => {
        try {
            const response = await originalGoto.call(this, url, options);
            if (response.ok())
                return response;

            throw new Error(`${response.status()} ${STATUS_CODES[response.status()]}`);
        }
        catch (e) {
            logger.error(`第${attempt}次尝试失败`, "goto", { url, options }, e);

            if (attempt >= retries)
                return null;

            throw e;
        }
    }, { retries, factor: 1 });
};

const originalClick = Frame.prototype.click;
Frame.prototype.click = async function (
    this: Frame,
    selector: string,
    options?: Readonly<ClickOptions>
): Promise<void> {
    await this.$x(selector);
    return originalClick.call(this, selector.startsWith("xpath=") ? selector : `xpath=${selector}`, options);
};

const originalType = Frame.prototype.type;
Frame.prototype.type = async function (
    this: Frame,
    selector: string,
    text: string,
    options?: Readonly<KeyboardTypeOptions>
): Promise<void> {
    await (await this.$x(selector)).click({ count: 3 });
    return originalType.call(this, selector.startsWith("xpath=") ? selector : `xpath=${selector}`, text, options);
};

const originalWaitForNavigation = Frame.prototype.waitForNavigation;
Frame.prototype.waitForNavigation = function (
    this: Frame,
    options?: WaitForOptions
): Promise<HTTPResponse | null> {
    let count = 3;
    while (count-- > 0) {
        const response = originalWaitForNavigation.call(this, options);
        if (response.ok())
            return response;

        logger.info(`waitForNavigation ${this.url()} ${response.status()} ${STATUS_CODES[response.status()]}`);
        this.page().reload();
    }
};

const originalWaitForSelector = Frame.prototype.waitForSelector;
Frame.prototype.waitForSelector = function <Selector extends string>(
    this: Frame,
    selector: Selector,
    options?: WaitForSelectorOptions
): Promise<ElementHandle<NodeFor<Selector>> | null> {
    const config = { visible: true, timeout: 10_000, ...options };

    if (config.hidden)
        config.visible = false;

    const retries = options?.retries ?? 3;

    return retry(async (_, attempt) => {
        try {
            return await originalWaitForSelector.call(this, selector, config);
        }
        catch (e) {
            logger.error(`第${attempt}次尝试失败`, "waitForSelector", { selector, options: config }, e);

            if (attempt >= retries)
                return null;

            throw e;
        }
    }, { retries, factor: 1 });
};

const originalWaitForFrame = Page.prototype.waitForFrame;
Page.prototype.waitForFrame = function (
    this: Page,
    urlOrPredicate: string | ((frame: Frame) => Awaitable<boolean>),
    options?: WaitTimeoutOptions
): Promise<Frame> {
    return originalWaitForFrame.call(this, urlOrPredicate, options).catch(() => undefined);
};

Frame.prototype.$x = function <Selector extends string>(
    this: Frame,
    selector: Selector,
    options?: WaitForSelectorOptions
): Promise<ElementHandle<NodeFor<Selector>> | null> {
    return this.waitForSelector(selector.startsWith("xpath=") ? selector : `xpath=${selector}`, options) as Promise<ElementHandle<NodeFor<Selector>> | null>;
};

Page.prototype.$x = function <Selector extends string>(
    this: Page,
    selector: Selector,
    options?: WaitForSelectorOptions
): Promise<ElementHandle<NodeFor<Selector>> | null> {
    return this.mainFrame().$x(selector, options);
};

Frame.prototype.$$x = async function <Selector extends string>(
    this: Frame,
    selector: Selector,
    options?: WaitForSelectorOptions
): Promise<Array<ElementHandle<NodeFor<Selector>>>> {
    await this.$x(selector, options);
    return this.$$(selector.startsWith("xpath=") ? selector : `xpath=${selector}`) as Promise<Array<ElementHandle<NodeFor<Selector>>>>;
};

Page.prototype.$$x = function <Selector extends string>(
    this: Page,
    selector: Selector,
    options?: WaitForSelectorOptions
): Promise<Array<ElementHandle<NodeFor<Selector>>>> {
    return this.mainFrame().$$x(selector, options);
};

Frame.prototype.textContent = async function <Selector extends string>(
    this: Frame,
    selector: Selector,
    options?: WaitForSelectorOptions
): Promise<string> {
    const el = await this.$x(selector, options);
    return this.evaluate(el => el.textContent.trim(), el);
};

Page.prototype.textContent = async function <Selector extends string>(
    this: Page,
    selector: Selector,
    options?: WaitForSelectorOptions
): Promise<string> {
    return this.mainFrame().textContent(selector, options);
};

const agent = new SocksProxyAgent('socks5://127.0.0.1:10808');
const originalGet = axios.get;
axios.get = function <T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    config?: AxiosRequestConfig<D>
): Promise<R> {
    const newConfig: AxiosRequestConfig<D> = {
        ...config,
        httpAgent: agent,
        httpsAgent: agent,
    };
    return originalGet.call(this, url, newConfig);
};