import type { DefaultThemeRenderContext } from "../DefaultThemeRenderContext.js";
import { i18n, JSX } from "#utils";
import type { DeclarationHierarchy, Type } from "../../../../models/index.js";

const isLinkedReferenceType = (type: Type) =>
    type.visit({
        reference: (ref) => ref.reflection !== undefined,
    }) ?? false;

function hasAnyLinkedReferenceType(h: DeclarationHierarchy | undefined): boolean {
    if (!h) return false;

    if (!h.isTarget && h.types.some(isLinkedReferenceType)) return true;

    return hasAnyLinkedReferenceType(h.next);
}

export function hierarchy(context: DefaultThemeRenderContext, typeHierarchy: DeclarationHierarchy | undefined) {
    if (!typeHierarchy) return;

    const summaryLink = context.options.getValue("includeHierarchySummary") && hasAnyLinkedReferenceType(typeHierarchy)
        ? (
            <>
                {" "}
                (
                <a href={context.relativeURL("hierarchy.html") + "#" + context.model.getFullName()}>
                    {i18n.theme_hierarchy_view_summary()}
                </a>
                )
            </>
        )
        : <></>;

    return (
        <section class="tsd-panel tsd-hierarchy" data-refl={context.model.id}>
            <h4>
                {i18n.theme_hierarchy()}
                {summaryLink}
            </h4>

            {hierarchyList(context, typeHierarchy)}
        </section>
    );
}

function hierarchyList(context: DefaultThemeRenderContext, props: DeclarationHierarchy) {
    return (
        <ul class="tsd-hierarchy">
            {props.types.map((item, i, l) => (
                <li class="tsd-hierarchy-item">
                    {props.isTarget ? <span class="tsd-hierarchy-target">{item.toString()}</span> : context.type(item)}
                    {i === l.length - 1 && !!props.next && hierarchyList(context, props.next)}
                </li>
            ))}
        </ul>
    );
}
