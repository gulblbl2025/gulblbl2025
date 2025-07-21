import 'puppeteer';

declare module 'puppeteer' {
    interface Frame {
        $x<Selector extends string>(
            selector: Selector,
            options?: WaitForSelectorOptions
        ): Promise<ElementHandle<NodeFor<Selector>> | null>;

        $$x<Selector extends string>(
            selector: Selector,
            options?: WaitForSelectorOptions
        ): Promise<Array<ElementHandle<NodeFor<Selector>>>>;

        textContent<Selector extends string>(
            selector: Selector,
            options?: WaitForSelectorOptions
        ): Promise<string>;
    }

    interface Page {
        $x<Selector extends string>(
            selector: Selector,
            options?: WaitForSelectorOptions
        ): Promise<ElementHandle<NodeFor<Selector>> | null>;

        $$x<Selector extends string>(
            selector: Selector,
            options?: WaitForSelectorOptions
        ): Promise<Array<ElementHandle<NodeFor<Selector>>>>;

        textContent<Selector extends string>(
            selector: Selector,
            options?: WaitForSelectorOptions
        ): Promise<string>;
    }

    interface GoToOptions {
        retries?: number;
    }

    interface WaitForSelectorOptions {
        retries?: number;
    }
}
