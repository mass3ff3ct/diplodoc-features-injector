import type {BaseConfig, BaseProgram, IExtension} from '@diplodoc/cli/lib/program'
import type {Toc, TocItem} from '@diplodoc/cli/lib/toc'
import {ok} from 'node:assert'
import {getHooks as getBaseHooks} from '@diplodoc/cli/lib/program'
import {getHooks as getTocHooks} from '@diplodoc/cli/lib/toc'
import {getBuildHooks, getEntryHooks, getSearchHooks} from '@diplodoc/cli'
import {isExternalHref, setExt, shortLink} from '@diplodoc/cli/lib/utils'
import {join} from "node:path"

type ConfigWithCleanLinks = BaseConfig & {
    cleanLinks: boolean
}

type Indexer = {
    add: (lang: string, url: string, data: any) => Promise<void>
}

type BreadcrumbsItem = {url?: string}

const htmlLinkExp = /href="(.*?)"/

export class Extension implements IExtension {
    apply(program: BaseProgram<ConfigWithCleanLinks>): void {
        getBaseHooks(program).Config.tap('CleanLinks', (config) => {
            if (!config.cleanLinks) {
                return config
            }

            const options = Object.assign({}, {ext: true, index: true}, config.cleanLinks)

            ok("boolean" === typeof config.cleanLinks, 'cleanLinks must be boolean type')

            config.cleanLinks = options

            return config
        })

        getBuildHooks(program).BeforeRun.for('html').tap('CleanLinks', (run) => {
            if (!program.config.cleanLinks) {
                return
            }

            getTocHooks(run.toc).Dump.tapPromise('CleanLinks', async (vfile) => {
                await run.toc.walkItems([vfile.data as Toc], async (item: Toc | TocItem) => {
                    if (item.href && !isExternalHref(item.href)) {
                        item.href = shortLink(item.href)
                    }

                    return item
                })
            })

            getEntryHooks(run.entry).State.tap('CleanLinks', (state) => {
                if (state.data.html) {
                    state.data.html = cleanHtmlLinks(state.data.html)
                }

                if (state.data.breadcrumbs) {
                    (state.data.breadcrumbs as BreadcrumbsItem[]).forEach(breadcrumbItem => {
                        if (breadcrumbItem.url) {
                            breadcrumbItem.url = shortLink(breadcrumbItem.url)
                        }
                    })
                }

                state.router.pathname = shortLink(state.router.pathname)

                return state
            })

            getEntryHooks(run.entry).Page.tap('CleanLinks', (template) => {

                const initOptions = {
                    route: setExt(template.path, '')
                }

                template.addScript('_extensions/clean-links-extension.js', {
                    position: 'leading',
                    attrs: {
                        defer: void 0
                    }
                })

                template.addScript(`window.cleanLinksExtensionInit(${JSON.stringify(initOptions)})`, {
                    position: 'state',
                    inline: true,
                });

                return template
            })


            getSearchHooks(run.search).Provider.for('local').tap('CleanLinks', (provider) => {
                if ("indexer" in provider) {
                    const indexer = provider.indexer as Indexer
                    const ownAddMethod = indexer.add

                    indexer.add = async (lang, url, data) => ownAddMethod.call(indexer, lang, shortLink(url), data)
                }

                return provider
            })
        })

        getBuildHooks(program).AfterRun.for('html').tapPromise('CleanLinks', async (run) => {
            if (!program.config.cleanLinks) {
                return
            }

            const extensionFilePath = join(__dirname, 'resources', 'clean-links-extension.js')

            try {
                await run.copy(
                    extensionFilePath,
                    join(run.output, '_extensions', 'clean-links-extension.js')
                );
            } catch (error) {
                run.logger.warn(`Unable copy the clean-links extension script ${extensionFilePath}.`, error);
            }
        })
    }
}

function cleanHtmlLinks(html: string) {
    return html.replace(htmlLinkExp, (match, href) => match.replace(href, shortLink(href)))
}