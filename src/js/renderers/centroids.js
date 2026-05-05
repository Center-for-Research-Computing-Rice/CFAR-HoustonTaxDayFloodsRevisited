/** Difference mode: filter leaves only transported-only floods; one symbol is enough. */
export function createDifferenceCentroidSimpleRenderer() {
    return {
        type: "simple",
        symbol: {
            type: "simple-marker",
            size: 4,
            color: "#ff8c00",
            outline: { color: "#dfdcdcbe", width: 0.5 }
        }
    };
}

export function createCentroidRenderer(fieldName) {
    return {
        type: "class-breaks",
        field: fieldName,
        classBreakInfos: [
            {
                minValue: Number.NEGATIVE_INFINITY,
                maxValue: 0,
                symbol: {
                    type: "simple-marker",
                    size: 4,
                    color: "#ffffff",
                    outline: { color: "#dfdcdcbe", width: 0.5 }
                },
                label: "No flood"
            },
            {
                minValue: Number.MIN_VALUE,
                maxValue: Number.POSITIVE_INFINITY,
                symbol: {
                    type: "simple-marker",
                    size: 4,
                    color: "#ff8c00",
                    outline: { color: "#dfdcdcbe", width: 0.5 }
                },
                label: "Flooded"
            }
        ],
        defaultSymbol: {
            type: "simple-marker",
            size: 4,
            color: "#ffffff",
            outline: { color: "#dfdcdcbe", width: 0.5 }
        }
    };
}
