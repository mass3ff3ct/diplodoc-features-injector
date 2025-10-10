import {ok} from 'node:assert'
import {join} from 'node:path'
import type {BaseConfig, BaseProgram, IExtension} from '@diplodoc/cli/lib/program'
import type {Toc, TocItem} from '@diplodoc/cli/lib/toc'
import {getHooks as getBaseHooks} from '@diplodoc/cli/lib/program'
import {setExt, isExternalHref, shortLink} from '@diplodoc/cli/lib/utils'

import {getBuildHooks, getEntryHooks} from '@diplodoc/cli'

type BreadcrumbsOptions = {
    tocAsRoot?: boolean
    appendLabeled?: boolean
}

type BreadcrumbItem = {
    name: string
    url?: string
}

type BreadcrumbCacheMap = Map<string, Map<string, BreadcrumbItem[]>>

type ConfigWithBreadcrumbs = BaseConfig & {
    breadcrumbs: boolean | BreadcrumbsOptions
}

export class Extension implements IExtension {
    apply(program: BaseProgram<ConfigWithBreadcrumbs>): void {
        getBaseHooks(program).Config.tap('Breadcrumbs', (config) => {
            if (!config.breadcrumbs) {
                return config
            }

            ok((config.breadcrumbs === true || "object" === typeof config.breadcrumbs), 'breadcrumbs must be object or true')

            const options = Object.assign({}, {tocAsRoot: true, appendLabeled: false}, config.breadcrumbs)

            ok("boolean" === typeof options.tocAsRoot, 'breadcrumbs.tocAsRoot must be boolean type')
            ok("boolean" === typeof options.appendLabeled, 'breadcrumbs.appendLabeled must be boolean type')

            config.breadcrumbs = options

            return config
        })

        getBuildHooks(program).BeforeRun.for('html').tap('Breadcrumbs', (run) => {
            if (!program.config.breadcrumbs) {
                return
            }

            const tocService = run.toc
            const breadcrumbCacheMap = new Map<string, Map<string, BreadcrumbItem[]>>()

            let skipHtmlExtension = false

            if ("skipHtmlExtension" in program.config && program.config.skipHtmlExtension !== false) {
                skipHtmlExtension = true
            }

            if ("cleanLinks" in program.config && program.config.cleanLinks !== false) {
                skipHtmlExtension = true
            }

            getEntryHooks(run.entry).State.tap('Breadcrumbs', (state) => {
                const toc = tocService.for(state.data.meta.vcsPath)

                if (!toc.items || toc.items.length === 0) {
                    return state
                }

                const breadcrumbsMap = getBreadcrumbsMap(toc, program.config.breadcrumbs as BreadcrumbsOptions, breadcrumbCacheMap)

                const rootPath = join(state.router.pathname, state.router.base)
                const pathname = state.router.pathname.replace(rootPath, '')

                if (!breadcrumbsMap.has(pathname)) {
                    return state
                }

                state.data.breadcrumbs = breadcrumbsMap.get(pathname)!.map(item => {
                    if (!item.url || isExternalHref(item.url)) {
                        return item
                    }

                    const url = join(rootPath, item.url) + '.html'

                    return {
                        ...item,
                        url: skipHtmlExtension ? shortLink(url) : url
                    }
                })

                return state
            })
        })
    }
}

function getBreadcrumbsMap(toc: Toc, config: BreadcrumbsOptions, breadcrumbCacheMap: BreadcrumbCacheMap) {
    if (!breadcrumbCacheMap.has(toc.path)) {
        breadcrumbCacheMap.set(toc.path, createBreadcrumbsMap(toc, config))
    }

    return breadcrumbCacheMap.get(toc.path)!
}

function createBreadcrumbsMap(toc: Toc, options: BreadcrumbsOptions) {
    const breadcrumbsMap = new Map<string, BreadcrumbItem[]>()

    function processItem(item: TocItem & {labeled?: boolean}, currentPath: BreadcrumbItem[]) {
        const breadcrumbItem: BreadcrumbItem = {name: item.name}

        if (item.href) {
            breadcrumbItem.url = setExt(item.href, '')
        }

        if (breadcrumbItem.url) {
            breadcrumbsMap.set(breadcrumbItem.url, [...currentPath, breadcrumbItem])
        }

        if (item.items!?.length > 0) {
            const breadcrumbItems = !options.appendLabeled && item.labeled && !breadcrumbItem.url
                ? [...currentPath]
                : [...currentPath, breadcrumbItem]

            item.items!.forEach(child => processItem(child, breadcrumbItems));
        }
    }

    const initialBreadcrumbItems: BreadcrumbItem[] = options.tocAsRoot && toc.title && toc.href
        ? [{name: toc.title, url: toc.href}]
        : []


    toc.items!.forEach(item => processItem(item, initialBreadcrumbItems));

    return breadcrumbsMap
}










