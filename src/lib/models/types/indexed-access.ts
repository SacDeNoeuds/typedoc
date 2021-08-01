import { Type } from "./abstract";

/**
 * Represents an indexed access type.
 */
export class IndexedAccessType extends Type {
    /**
     * The type name identifier.
     */
    override readonly type = "indexedAccess";

    /**
     * Create a new TupleType instance.
     *
     * @param elementType  The type of the array's elements.
     */
    constructor(public objectType: Type, public indexType: Type) {
        super();
    }

    /**
     * Clone this type.
     *
     * @return A clone of this type.
     */
    override clone(): Type {
        return new IndexedAccessType(
            this.objectType.clone(),
            this.indexType.clone()
        );
    }

    /**
     * Return a string representation of this type.
     */
    override toString() {
        return `${this.objectType.toString()}[${this.indexType.toString()}]`;
    }
}
