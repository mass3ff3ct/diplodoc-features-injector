"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Extension = void 0;
const node_assert_1 = require("node:assert");
const program_1 = require("@diplodoc/cli/lib/program");
const toc_1 = require("@diplodoc/cli/lib/toc");
const cli_1 = require("@diplodoc/cli");
const utils_1 = require("@diplodoc/cli/lib/utils");
const node_path_1 = require("node:path");
const htmlLinkExp = /href="(.*?)"/;
class Extension {
    apply(program) {
        (0, program_1.getHooks)(program).Config.tap('CleanLinks', (config) => {
            if (!config.cleanLinks) {
                return config;
            }
            const options = Object.assign({}, { ext: true, index: true }, config.cleanLinks);
            (0, node_assert_1.ok)("boolean" === typeof config.cleanLinks, 'cleanLinks must be boolean type');
            config.cleanLinks = options;
            return config;
        });
        (0, cli_1.getBuildHooks)(program).BeforeRun.for('html').tap('CleanLinks', (run) => {
            if (!program.config.cleanLinks) {
                return;
            }
            (0, toc_1.getHooks)(run.toc).Dump.tapPromise('CleanLinks', async (vfile) => {
                await run.toc.walkItems([vfile.data], async (item) => {
                    if (item.href && !(0, utils_1.isExternalHref)(item.href)) {
                        item.href = (0, utils_1.shortLink)(item.href);
                    }
                    return item;
                });
            });
            (0, cli_1.getEntryHooks)(run.entry).State.tap('CleanLinks', (state) => {
                if (state.data.html) {
                    state.data.html = cleanHtmlLinks(state.data.html);
                }
                if (state.data.breadcrumbs) {
                    state.data.breadcrumbs.forEach(breadcrumbItem => {
                        if (breadcrumbItem.url) {
                            breadcrumbItem.url = (0, utils_1.shortLink)(breadcrumbItem.url);
                        }
                    });
                }
                state.router.pathname = (0, utils_1.shortLink)(state.router.pathname);
                return state;
            });
            (0, cli_1.getEntryHooks)(run.entry).Page.tap('CleanLinks', (template) => {
                const initOptions = {
                    route: (0, utils_1.setExt)(template.path, '')
                };
                template.addScript('_extensions/clean-links-extension.js', {
                    position: 'leading',
                    attrs: {
                        defer: void 0
                    }
                });
                template.addScript(`window.cleanLinksExtensionInit(${JSON.stringify(initOptions)})`, {
                    position: 'state',
                    inline: true,
                });
                return template;
            });
            (0, cli_1.getSearchHooks)(run.search).Provider.for('local').tap('CleanLinks', (provider) => {
                if ("indexer" in provider) {
                    const indexer = provider.indexer;
                    const ownAddMethod = indexer.add;
                    indexer.add = async (lang, url, data) => ownAddMethod.call(indexer, lang, (0, utils_1.shortLink)(url), data);
                }
                return provider;
            });
        });
        (0, cli_1.getBuildHooks)(program).AfterRun.for('html').tapPromise('CleanLinks', async (run) => {
            if (!program.config.cleanLinks) {
                return;
            }
            const extensionFilePath = (0, node_path_1.join)(__dirname, 'resources', 'clean-links-extension.js');
            try {
                await run.copy(extensionFilePath, (0, node_path_1.join)(run.output, '_extensions', 'clean-links-extension.js'));
            }
            catch (error) {
                run.logger.warn(`Unable copy the clean-links extension script ${extensionFilePath}.`, error);
            }
        });
    }
}
exports.Extension = Extension;
function cleanHtmlLinks(html) {
    return html.replace(htmlLinkExp, (match, href) => match.replace(href, (0, utils_1.shortLink)(href)));
}
