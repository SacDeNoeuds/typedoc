import { assertNever, removeIf } from "../../utils";
import type { Reflection } from "../reflections";
import { ReflectionKind } from "../reflections/kind";
import { ReflectionSymbolId } from "../reflections/ReflectionSymbolId";

import type { Serializer, Deserializer, JSONOutput } from "../../serialization";
import { NonEnumerable } from "../../utils/general";

/**
 * Represents a parsed piece of a comment.
 * @category Comments
 */
export type CommentDisplayPart =
    | { kind: "text"; text: string }
    | { kind: "code"; text: string }
    | InlineTagDisplayPart
    | RelativeLinkDisplayPart;

/**
 * The `@link`, `@linkcode`, and `@linkplain` tags may have a `target`
 * property set indicating which reflection/url they link to. They may also
 * have a `tsLinkText` property which includes the part of the `text` which
 * TypeScript thinks should be displayed as the link text.
 * @category Comments
 */
export interface InlineTagDisplayPart {
    kind: "inline-tag";
    tag: `@${string}`;
    text: string;
    target?: Reflection | string | ReflectionSymbolId;
    tsLinkText?: string;
}

/**
 * This is used for relative links within comments/documents.
 * It is used to mark pieces of text which need to be replaced
 * to make links work properly.
 */
export interface RelativeLinkDisplayPart {
    kind: "relative-link";
    /**
     * The original relative text from the parsed comment.
     */
    text: string;
    /**
     * If this is a {@link Reflection}, then it should be replaced with
     * the relative path to the reflection's url. If it is a `number`,
     * then the {@link ProjectReflection.media} can be used to retrieve
     * the source path.
     */
    target: Reflection | number;
}

/**
 * A model that represents a single TypeDoc comment tag.
 *
 * Tags are stored in the {@link Comment.blockTags} property.
 * @category Comments
 */
export class CommentTag {
    /**
     * The name of this tag, e.g. `@returns`, `@example`
     */
    tag: `@${string}`;

    /**
     * Some tags, (`@typedef`, `@param`, `@property`, etc.) may have a user defined identifier associated with them.
     * If this tag is one of those, it will be parsed out and included here.
     */
    name?: string;

    /**
     * The actual body text of this tag.
     */
    content: CommentDisplayPart[];

    /**
     * Create a new CommentTag instance.
     */
    constructor(tag: `@${string}`, text: CommentDisplayPart[]) {
        this.tag = tag;
        this.content = text;
    }

    clone(): CommentTag {
        const tag = new CommentTag(
            this.tag,
            Comment.cloneDisplayParts(this.content),
        );
        if (this.name) {
            tag.name = this.name;
        }
        return tag;
    }

    toObject(serializer: Serializer): JSONOutput.CommentTag {
        return {
            tag: this.tag,
            name: this.name,
            content: Comment.serializeDisplayParts(serializer, this.content),
        };
    }

    fromObject(de: Deserializer, obj: JSONOutput.CommentTag) {
        // tag already set by Comment.fromObject
        this.name = obj.name;
        this.content = Comment.deserializeDisplayParts(de, obj.content);
    }
}

/**
 * A model that represents a comment.
 *
 * Instances of this model are created by the CommentPlugin. You can retrieve comments
 * through the {@link DeclarationReflection.comment} property.
 * @category Comments
 */
export class Comment {
    /**
     * Debugging utility for combining parts into a simple string. Not suitable for
     * rendering, but can be useful in tests.
     */
    static combineDisplayParts(
        parts: readonly CommentDisplayPart[] | undefined,
    ): string {
        let result = "";

        for (const item of parts || []) {
            switch (item.kind) {
                case "text":
                case "code":
                    result += item.text;
                    break;
                case "inline-tag":
                    result += `{${item.tag} ${item.text}}`;
                    break;
                case "relative-link":
                    result += `{rel:${typeof item.target == "number" ? item.target : item.target.getFullName()}}`;
                    break;
                default:
                    assertNever(item);
            }
        }

        return result;
    }

    /**
     * Helper function to convert an array of comment display parts into markdown suitable for
     * passing into markdown-it.
     * @param urlTo - Used to resolve urls to any reflections linked to with `@link` tags..
     * @param useHtml - If set, will produce `<a>` links which can be colored according to the reflection type they are pointed at.
     */
    static displayPartsToMarkdown(
        parts: readonly CommentDisplayPart[],
        urlTo: (ref: Reflection) => string,
        useHtml: boolean,
    ) {
        const result: string[] = [];

        for (const part of parts) {
            switch (part.kind) {
                case "text":
                case "code":
                    result.push(part.text);
                    break;
                case "inline-tag":
                    switch (part.tag) {
                        case "@label":
                        case "@inheritdoc": // Shouldn't happen
                            break; // Not rendered.
                        case "@link":
                        case "@linkcode":
                        case "@linkplain": {
                            if (part.target) {
                                let url: string | undefined;
                                let kindClass: string | undefined;
                                if (typeof part.target === "string") {
                                    url = part.target;
                                } else if ("id" in part.target) {
                                    // No point in trying to resolve a ReflectionSymbolId at this point, we've already
                                    // tried and failed during the resolution step.
                                    url = urlTo(part.target);
                                    kindClass = ReflectionKind.classString(
                                        part.target.kind,
                                    );
                                }

                                if (useHtml) {
                                    const text =
                                        part.tag === "@linkcode"
                                            ? `<code>${part.text}</code>`
                                            : part.text;
                                    result.push(
                                        url
                                            ? `<a href="${url}"${
                                                  kindClass
                                                      ? ` class="${kindClass}"`
                                                      : ""
                                              }>${text}</a>`
                                            : part.text,
                                    );
                                } else {
                                    const text =
                                        part.tag === "@linkcode"
                                            ? "`" + part.text + "`"
                                            : part.text;
                                    result.push(
                                        url ? `[${text}](${url})` : text,
                                    );
                                }
                            } else {
                                result.push(part.text);
                            }
                            break;
                        }
                        default:
                            // Hmm... probably want to be able to render these somehow, so custom inline tags can be given
                            // special rendering rules. Future capability. For now, just render their text.
                            result.push(`{${part.tag} ${part.text}}`);
                            break;
                    }
                    break;
                case "relative-link":
                    // TODO GERRIT
                    break;
                default:
                    assertNever(part);
            }
        }

        return result.join("");
    }

    /**
     * Helper utility to clone {@link Comment.summary} or {@link CommentTag.content}
     */
    static cloneDisplayParts(parts: readonly CommentDisplayPart[]) {
        return parts.map((p) => ({ ...p }));
    }

    //Since display parts are plain objects, this lives here
    static serializeDisplayParts(
        serializer: Serializer,
        parts: CommentDisplayPart[],
    ): JSONOutput.CommentDisplayPart[];
    /** @hidden no point in showing this signature in api docs */
    static serializeDisplayParts(
        serializer: Serializer,
        parts: CommentDisplayPart[] | undefined,
    ): JSONOutput.CommentDisplayPart[] | undefined;
    static serializeDisplayParts(
        serializer: Serializer,
        parts: CommentDisplayPart[] | undefined,
    ): JSONOutput.CommentDisplayPart[] | undefined {
        return parts?.map((part) => {
            switch (part.kind) {
                case "text":
                case "code":
                    return { ...part };
                case "inline-tag": {
                    let target: JSONOutput.InlineTagDisplayPart["target"];
                    if (typeof part.target === "string") {
                        target = part.target;
                    } else if (part.target) {
                        if ("id" in part.target) {
                            target = part.target.id;
                        } else {
                            target = part.target.toObject(serializer);
                        }
                    }
                    return {
                        ...part,
                        target,
                    };
                }
                case "relative-link": {
                    if (typeof part.target === "number") {
                        return {
                            ...part,
                            target: { media: part.target },
                        };
                    } else {
                        return {
                            ...part,
                            target: { reflection: part.target.id },
                        };
                    }
                }
            }
        });
    }

    //Since display parts are plain objects, this lives here
    static deserializeDisplayParts(
        de: Deserializer,
        parts: JSONOutput.CommentDisplayPart[],
    ): CommentDisplayPart[] {
        const links: [
            number,
            InlineTagDisplayPart | RelativeLinkDisplayPart,
        ][] = [];

        const result = parts.map((part): CommentDisplayPart => {
            switch (part.kind) {
                case "text":
                case "code":
                    return { ...part };
                case "inline-tag": {
                    if (typeof part.target === "number") {
                        const part2 = {
                            kind: part.kind,
                            tag: part.tag,
                            text: part.text,
                            target: undefined,
                            tsLinkText: part.tsLinkText,
                        } satisfies InlineTagDisplayPart;
                        links.push([part.target, part2]);
                        return part2;
                    } else if (
                        typeof part.target === "string" ||
                        part.target === undefined
                    ) {
                        return {
                            kind: "inline-tag",
                            tag: part.tag,
                            text: part.text,
                            target: part.target,
                            tsLinkText: part.tsLinkText,
                        } satisfies InlineTagDisplayPart;
                    } else if (typeof part.target === "object") {
                        return {
                            kind: "inline-tag",
                            tag: part.tag,
                            text: part.text,
                            target: new ReflectionSymbolId(part.target),
                            tsLinkText: part.tsLinkText,
                        } satisfies InlineTagDisplayPart;
                    } else {
                        assertNever(part.target);
                    }
                }
                case "relative-link": {
                    if ("media" in part.target) {
                        return {
                            kind: "relative-link",
                            text: part.text,
                            target: part.target.media,
                        } satisfies RelativeLinkDisplayPart;
                    } else {
                        const part2 = {
                            kind: "relative-link",
                            text: part.text,
                            target: null!,
                        } satisfies RelativeLinkDisplayPart;
                        links.push([part.target.reflection, part2]);
                        return part2;
                    }
                }
            }
        });

        if (links.length) {
            de.defer((project) => {
                for (const [oldId, part] of links) {
                    part.target = project.getReflectionById(
                        de.oldIdToNewId[oldId] ?? -1,
                    );
                    if (!part.target) {
                        de.logger.warn(
                            de.application.i18n.serialized_project_referenced_0_not_part_of_project(
                                oldId.toString(),
                            ),
                        );
                    }
                }
            });
        }

        return result;
    }

    /**
     * Splits the provided parts into a header (first line, as a string)
     * and body (remaining lines). If the header line contains inline tags
     * they will be serialized to a string.
     */
    static splitPartsToHeaderAndBody(parts: readonly CommentDisplayPart[]): {
        header: string;
        body: CommentDisplayPart[];
    } {
        let index = parts.findIndex((part): boolean => {
            switch (part.kind) {
                case "text":
                case "code":
                    return part.text.includes("\n");
                case "inline-tag":
                case "relative-link":
                    return false;
            }
        });

        if (index === -1) {
            return {
                header: Comment.combineDisplayParts(parts),
                body: [],
            };
        }

        // Do not split a code block, stop the header at the end of the previous block
        if (parts[index].kind === "code") {
            --index;
        }

        if (index === -1) {
            return { header: "", body: Comment.cloneDisplayParts(parts) };
        }

        let header = Comment.combineDisplayParts(parts.slice(0, index));
        const split = parts[index].text.indexOf("\n");

        let body: CommentDisplayPart[];
        if (split === -1) {
            header += parts[index].text;
            body = Comment.cloneDisplayParts(parts.slice(index + 1));
        } else {
            header += parts[index].text.substring(0, split);
            body = Comment.cloneDisplayParts(parts.slice(index));
            body[0].text = body[0].text.substring(split + 1);
        }

        if (!body[0].text) {
            body.shift();
        }

        return { header: header.trim(), body };
    }

    /**
     * The content of the comment which is not associated with a block tag.
     */
    summary: CommentDisplayPart[];

    /**
     * All associated block level tags.
     */
    blockTags: CommentTag[] = [];

    /**
     * All modifier tags present on the comment, e.g. `@alpha`, `@beta`.
     */
    modifierTags: Set<`@${string}`> = new Set();

    /**
     * Label associated with this reflection, if any (https://tsdoc.org/pages/tags/label/)
     */
    label?: string;

    /**
     * Full path to the file where this comment originated from, if any.
     * This field will not be serialized, so will not be present when handling JSON-revived reflections.
     *
     * Note: This field is non-enumerable to make testing comment contents with `deepEqual` easier.
     */
    @NonEnumerable
    sourcePath?: string;

    /**
     * Internal discovery ID used to prevent symbol comments from
     * being duplicated on signatures. Only set when the comment was created
     * from a `ts.CommentRange`.
     * @internal
     */
    @NonEnumerable
    discoveryId?: number;

    /**
     * Creates a new Comment instance.
     */
    constructor(
        summary: CommentDisplayPart[] = [],
        blockTags: CommentTag[] = [],
        modifierTags: Set<`@${string}`> = new Set(),
    ) {
        this.summary = summary;
        this.blockTags = blockTags;
        this.modifierTags = modifierTags;
        extractLabelTag(this);
    }

    /**
     * Create a deep clone of this comment.
     */
    clone() {
        const comment = new Comment(
            Comment.cloneDisplayParts(this.summary),
            this.blockTags.map((tag) => tag.clone()),
            new Set(this.modifierTags),
        );
        comment.discoveryId = this.discoveryId;
        comment.sourcePath = this.sourcePath;
        return comment;
    }

    /**
     * Returns true if this comment is completely empty.
     * @internal
     */
    isEmpty() {
        return !this.hasVisibleComponent() && this.modifierTags.size === 0;
    }

    /**
     * Has this comment a visible component?
     *
     * @returns TRUE when this comment has a visible component.
     */
    hasVisibleComponent(): boolean {
        return (
            this.summary.some((x) => x.kind !== "text" || x.text !== "") ||
            this.blockTags.length > 0
        );
    }

    /**
     * Test whether this comment contains a tag with the given name.
     *
     * @param tagName  The name of the tag to look for.
     * @returns TRUE when this comment contains a tag with the given name, otherwise FALSE.
     */
    hasModifier(tagName: `@${string}`): boolean {
        return this.modifierTags.has(tagName);
    }

    removeModifier(tagName: `@${string}`) {
        this.modifierTags.delete(tagName);
    }

    /**
     * Return the first tag with the given name.
     *
     * @param tagName  The name of the tag to look for.
     * @returns The found tag or undefined.
     */
    getTag(tagName: `@${string}`): CommentTag | undefined {
        return this.blockTags.find((tag) => tag.tag === tagName);
    }

    /**
     * Get all tags with the given tag name.
     */
    getTags(tagName: `@${string}`): CommentTag[] {
        return this.blockTags.filter((tag) => tag.tag === tagName);
    }

    getIdentifiedTag(identifier: string, tagName: `@${string}`) {
        return this.blockTags.find(
            (tag) => tag.tag === tagName && tag.name === identifier,
        );
    }

    /**
     * Removes all block tags with the given tag name from the comment.
     * @param tagName
     */
    removeTags(tagName: `@${string}`) {
        removeIf(this.blockTags, (tag) => tag.tag === tagName);
    }

    toObject(serializer: Serializer): JSONOutput.Comment {
        return {
            summary: Comment.serializeDisplayParts(serializer, this.summary),
            blockTags: serializer.toObjectsOptional(this.blockTags),
            modifierTags:
                this.modifierTags.size > 0
                    ? Array.from(this.modifierTags)
                    : undefined,
            label: this.label,
        };
    }

    fromObject(de: Deserializer, obj: JSONOutput.Comment) {
        this.summary = Comment.deserializeDisplayParts(de, obj.summary);
        this.blockTags =
            obj.blockTags?.map((tagObj) => {
                const tag = new CommentTag(tagObj.tag, []);
                de.fromObject(tag, tagObj);
                return tag;
            }) || [];
        this.modifierTags = new Set(obj.modifierTags);
        this.label = obj.label;
    }
}

function extractLabelTag(comment: Comment) {
    const index = comment.summary.findIndex(
        (part) => part.kind === "inline-tag" && part.tag === "@label",
    );

    if (index !== -1) {
        comment.label = comment.summary.splice(index, 1)[0].text;
    }
}
