(() => {
    if (globalThis.__lookbehind_polyfill_applied) return;
    globalThis.__lookbehind_polyfill_applied = true;

    const NativeRegExp = globalThis.RegExp;

    let nativeSupportsIndices = false;
    try {
        const testRegex = new NativeRegExp("test", "d");
        nativeSupportsIndices = testRegex.hasIndices === true;
    } catch (e) {
        nativeSupportsIndices = false;
    }

    const regexReplacements = globalThis.__lookbehind_regex_replacements || [
        {
            original: "(?<! cu)bot|(?<! (ya|yandex))search",
            replacement: "bot|search",
            flags: "i",
        },
        {
            original: "(?<!\\.)@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
            replacement: "(?:[^.]|^)@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
            flags: "g",
        },
        {
            original: "(?<!^\\d).{8,}",
            replacement: "(?![0-9]).{8,}",
            flags: "",
        },
        {
            original: "(?<!file://)https?://[\\w.-]+",
            replacement: "(?!file://)https?://[\\w.-]+",
            flags: "g",
        },
        {
            original: "(?<!@)\\b\\w+\\b",
            replacement: "(?:^|[^@])\\b\\w+\\b",
            flags: "g",
        },
        {
            original: "(?<!\\.)([a-zA-Z][\\w-]*)",
            replacement: "(?:^|[^.]|\\s)([a-zA-Z][\\w-]*)",
            flags: "g",
        },
        {
            original: "(?<!\\d)\\d+\\.\\d+",
            replacement: "(?:^|[^\\d])\\d+\\.\\d+",
            flags: "g",
        },
        {
            original: "(?<! cu)bot",
            replacement: "bot",
        },
        {
            original: "(?<! (ya|yandex))search",
            replacement: "search",
        },
        {
            original:
                "(?<!email)(?<!email-)(?<!email_)(?<!email\\.)(?<!email\\s)(?<!ip)(?<!ip-)(?<!ip_)(?<!ip\\s)(?<!ip\\.)address",
            replacement: "address",
        },
        {
            original:
                "(?<!datadog_)(?<!dd_)api[-\\s._]{0,1}(?:secret|token|key)",
            replacement: "api[-\\s._]{0,1}(?:secret|token|key)",
        },
    ];

    globalThis.__lookbehind_regex_replacements = regexReplacements;
    globalThis.__lookbehind_partial_replacements = regexReplacements;

    function normalizeRegexSource(source) {
        return original.replace.call(source, /\\\\/g, "\\");
    }

    function checkForRegexReplacement(source, flags) {
        const normalizedSource = normalizeRegexSource(source);

        for (let r = 0; r < regexReplacements.length; r++) {
            const replacement = regexReplacements[r];
            const normalizedOriginal = normalizeRegexSource(
                replacement.original
            );

            if (normalizedOriginal === normalizedSource) {
                if (
                    replacement.flags !== undefined &&
                    replacement.flags !== flags
                ) {
                    continue;
                }
                return replacement.replacement;
            }
        }

        return null;
    }

    function findLookbehindEnd(source, patternStart) {
        let depth = 0;
        let escaped = false;

        for (let i = patternStart; i < source.length; i++) {
            const ch = source[i];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === "\\") {
                escaped = true;
                continue;
            }
            if (ch === "(") {
                depth++;
            } else if (ch === ")") {
                if (depth === 0) {
                    return i;
                }
                depth--;
            }
        }

        return -1;
    }

    function decodeLookbehindPattern(pattern) {
        let result = "";
        for (let i = 0; i < pattern.length; i++) {
            if (pattern[i] === "\\" && i + 1 < pattern.length) {
                result += pattern[++i];
            } else {
                result += pattern[i];
            }
        }
        return result;
    }

    function isComplexLookbehindPattern(pattern) {
        for (let i = 0; i < pattern.length; i++) {
            const ch = pattern[i];
            if (ch === "\\") {
                i++;
                if (i >= pattern.length) {
                    continue;
                }
                const next = pattern[i];
                if (".^$*+?()[]{}|/".indexOf(next) !== -1) {
                    continue;
                }
                return true;
            }
            if ("()|+*?{}[]".indexOf(ch) !== -1) {
                return true;
            }
        }
        return false;
    }

    function extractAllLookbehinds(source) {
        const assertions = [];
        let searchFrom = 0;

        while (searchFrom < source.length) {
            const lookbehindStart = source.indexOf("(?<", searchFrom);
            if (lookbehindStart === -1) {
                break;
            }

            const typeIndex = lookbehindStart + 3;
            const type = source[typeIndex];
            if (type !== "=" && type !== "!") {
                searchFrom = typeIndex;
                continue;
            }

            const patternStart = typeIndex + 1;
            const patternEnd = findLookbehindEnd(source, patternStart);
            if (patternEnd === -1) {
                return { isComplex: true };
            }

            const pattern = source.slice(patternStart, patternEnd);
            if (isComplexLookbehindPattern(pattern)) {
                if (globalThis.__isTest) {
                    throw new SyntaxError(
                        "Unsupported complex lookbehind: (?<" + type + pattern + ")"
                    );
                }
                return { isComplex: true };
            }

            const raw = source.slice(lookbehindStart, patternEnd + 1);
            assertions.push({
                type,
                pattern,
                decodedPattern: decodeLookbehindPattern(pattern),
                raw,
                index: lookbehindStart,
            });
            searchFrom = patternEnd + 1;
        }

        if (assertions.length === 0) {
            return null;
        }

        return { assertions, isComplex: false };
    }

    function removeLookbehindAssertions(source, assertions) {
        let result = source;
        const sorted = assertions.slice().sort(function (a, b) {
            return b.index - a.index;
        });

        for (let s = 0; s < sorted.length; s++) {
            const assertion = sorted[s];
            result =
                result.slice(0, assertion.index) +
                result.slice(assertion.index + assertion.raw.length);
        }

        return result;
    }

    function stripAllLookbehinds(source) {
        let result = source;
        let searchFrom = 0;

        while (searchFrom < result.length) {
            const lookbehindStart = result.indexOf("(?<", searchFrom);
            if (lookbehindStart === -1) {
                break;
            }

            const typeIndex = lookbehindStart + 3;
            const type = result[typeIndex];
            if (type !== "=" && type !== "!") {
                searchFrom = typeIndex;
                continue;
            }

            const patternStart = typeIndex + 1;
            const patternEnd = findLookbehindEnd(result, patternStart);
            if (patternEnd === -1) {
                break;
            }

            result =
                result.slice(0, lookbehindStart) +
                result.slice(patternEnd + 1);
            searchFrom = lookbehindStart;
        }

        return result;
    }

    function checkLookbehindAssertions(str, matchIndex, assertions, ignoreCase) {
        for (let a = 0; a < assertions.length; a++) {
            const assertion = assertions[a];
            const pattern = assertion.decodedPattern;
            const behind = str.slice(
                Math.max(0, matchIndex - pattern.length),
                matchIndex
            );
            const behindCmp = ignoreCase ? behind.toLowerCase() : behind;
            const patternCmp = ignoreCase ? pattern.toLowerCase() : pattern;
            const ends = behindCmp.endsWith(patternCmp);

            if (assertion.type === "=" ? !ends : ends) {
                return false;
            }
        }
        return true;
    }

    function safeSetProperty(obj, key, value) {
        try {
            obj[key] = value;
        } catch (e) {
            // Ignore readonly property errors
        }
    }

    function isRegExpLike(value) {
        if (!value || (typeof value !== "object" && typeof value !== "function")) {
            return false;
        }

        if (value instanceof NativeRegExp) {
            return true;
        }

        return Object.prototype.hasOwnProperty.call(value, "_regexp");
    }

    function copyStaticProperties() {
        const staticProps = [
            "input",
            "leftContext",
            "rightContext",
            "lastMatch",
            "lastParen",
        ];
        staticProps.forEach((prop) => {
            if (prop in NativeRegExp) {
                RegExp[prop] = NativeRegExp[prop];
            }
        });

        for (let i = 1; i <= 9; i++) {
            const prop = `$${i}`;
            if (prop in NativeRegExp) {
                RegExp[prop] = NativeRegExp[prop];
            }
        }
    }

    function createIndicesArray(match, str) {
        if (!match) return null;

        const indices = [[match.index, match.index + match[0].length]];
        let cursor = match.index;
        const matchEnd = match.index + match[0].length;

        for (let i = 1; i < match.length; i++) {
            if (match[i] !== undefined) {
                const groupValue = match[i];
                const groupIndex = str.indexOf(groupValue, cursor);
                if (
                    groupIndex !== -1 &&
                    groupIndex >= match.index &&
                    groupIndex < matchEnd
                ) {
                    indices.push([groupIndex, groupIndex + groupValue.length]);
                    cursor = groupIndex + groupValue.length;
                } else {
                    indices.push(undefined);
                }
            } else {
                indices.push(undefined);
            }
        }

        return indices;
    }

    function createPropertyGetter(propName, defaultValue = undefined) {
        return function () {
            if (this._regexp) {
                return this._regexp[propName];
            }
            try {
                return Object.getOwnPropertyDescriptor(
                    NativeRegExp.prototype,
                    propName
                ).get.call(this);
            } catch (e) {
                return defaultValue;
            }
        };
    }

    function updateRegExpStatics(match, input) {
        const left = input.slice(0, match.index);
        const right = input.slice(match.index + match[0].length);

        const targets = [globalThis.RegExp];
        if (NativeRegExp !== globalThis.RegExp) {
            targets.push(NativeRegExp);
        }

        for (let t = 0; t < targets.length; t++) {
            const target = targets[t];
            safeSetProperty(target, "input", input);
            safeSetProperty(target, "leftContext", left);
            safeSetProperty(target, "rightContext", right);
            safeSetProperty(target, "lastMatch", match[0]);
            safeSetProperty(target, "lastParen", match[match.length - 1] || "");
            safeSetProperty(target, "$&", match[0]);
            safeSetProperty(target, "$`", left);
            safeSetProperty(target, "$'", right);
            safeSetProperty(target, "$+", match[match.length - 1] || "");
        }

        for (let t = 0; t < targets.length; t++) {
            const target = targets[t];
            for (let i = 1; i <= 9; i++) {
                safeSetProperty(target, "$" + i, match[i] || "");
            }
        }
    }

    function ensureLastIndexDataProperty(regexp) {
        const descriptor = Object.getOwnPropertyDescriptor(regexp, "lastIndex");
        if (
            descriptor &&
            Object.prototype.hasOwnProperty.call(descriptor, "value")
        ) {
            regexp.lastIndex = 0;
            return;
        }

        try {
            Object.defineProperty(regexp, "lastIndex", {
                value: 0,
                writable: true,
                enumerable: false,
                configurable: false,
            });
        } catch (e) {
            regexp.lastIndex = 0;
        }
    }

    function createPolyfillRegExpInstance(
        nativeRegExp,
        originalSource,
        flags,
        lookbehindInfo
    ) {
        const baseRegExp = new NativeRegExp(
            nativeRegExp.source,
            nativeRegExp.flags
        );

        Object.defineProperty(baseRegExp, "_regexp", { value: nativeRegExp });
        Object.defineProperty(baseRegExp, "_originalSource", {
            value: originalSource,
        });
        Object.defineProperty(baseRegExp, "_flags", { value: flags });
        Object.defineProperty(baseRegExp, "_lookbehindInfo", {
            value: lookbehindInfo,
        });

        ensureLastIndexDataProperty(baseRegExp);

        Object.setPrototypeOf(baseRegExp, RegExp.prototype);

        return baseRegExp;
    }

    function callNativeStringMethod(method, str, pattern, arg) {
        const valid = pattern && pattern._regexp;
        if (valid) pattern._regexp.lastIndex = pattern.lastIndex;
        const result = method.call(str, valid ? pattern._regexp : pattern, arg);
        if (valid) pattern.lastIndex = pattern._regexp.lastIndex;
        return result;
    }

    function removeIndicesFlag(flags) {
        if (!flags.includes("d") || nativeSupportsIndices) {
            return flags;
        }
        return flags.replace(/d/g, "");
    }

    function expandReplacementString(replacement, match, str, offset) {
        let result = String(replacement);
        result = original.replace.call(result, /\$\$/g, "$");
        result = original.replace.call(result, /\$&/g, match[0]);
        result = original.replace.call(result, /\$`/g, str.slice(0, offset));
        result = original.replace.call(result, /\$'/g, str.slice(offset + match[0].length));
        for (let i = 1; i < match.length; i++) {
            const capture = match[i] === undefined ? "" : match[i];
            result = result.split("$" + i).join(capture);
        }
        return result;
    }

    function resetLastIndex(regex) {
        if (!regex.global && !regex.sticky) {
            regex.lastIndex = 0;
            if (regex._regexp) {
                regex._regexp.lastIndex = 0;
            }
        }
    }

    function RegExp(pattern, flags) {
        if (!(this instanceof RegExp)) {
            return new RegExp(pattern, flags);
        }

        let source, inputFlags;

        if (isRegExpLike(pattern)) {
            source = pattern.source;
            inputFlags = flags !== undefined ? flags : pattern.flags;
        } else {
            source = String(pattern);
            inputFlags = String(flags || "");
        }

        const replacementSource = checkForRegexReplacement(source, inputFlags);
        if (replacementSource) {
            const nativeRegExp = new NativeRegExp(
                replacementSource,
                removeIndicesFlag(inputFlags)
            );
            return createPolyfillRegExpInstance(
                nativeRegExp,
                source,
                inputFlags,
                null
            );
        }

        const lookbehindInfo = extractAllLookbehinds(source);

        if (lookbehindInfo && lookbehindInfo.isComplex) {
            try {
                const nativeRegExp = new NativeRegExp(
                    source,
                    removeIndicesFlag(inputFlags)
                );
                return createPolyfillRegExpInstance(
                    nativeRegExp,
                    source,
                    inputFlags,
                    null
                );
            } catch (e) {
                const nativeRegExp = new NativeRegExp(
                    stripAllLookbehinds(source),
                    removeIndicesFlag(inputFlags)
                );
                return createPolyfillRegExpInstance(
                    nativeRegExp,
                    source,
                    inputFlags,
                    null
                );
            }
        }

        const sourceWithoutLB = lookbehindInfo
            ? removeLookbehindAssertions(source, lookbehindInfo.assertions)
            : source;

        const nativeRegExp = new NativeRegExp(
            sourceWithoutLB,
            removeIndicesFlag(inputFlags)
        );

        return createPolyfillRegExpInstance(
            nativeRegExp,
            source,
            inputFlags,
            lookbehindInfo
        );
    }

    RegExp.prototype = Object.create(NativeRegExp.prototype);

    Object.defineProperty(RegExp, Symbol.hasInstance, {
        configurable: true,
        value: function (instance) {
            return isRegExpLike(instance);
        },
    });

    RegExp.toString = function () {
        return "function RegExp() { [lookbehind polyfilled code] }";
    };

    const regexpProperties = [
        { name: "global", defaultValue: undefined },
        { name: "ignoreCase", defaultValue: undefined },
        { name: "multiline", defaultValue: undefined },
        { name: "dotAll", defaultValue: undefined },
        { name: "unicode", defaultValue: undefined },
        { name: "sticky", defaultValue: undefined },
    ];

    regexpProperties.forEach(function (entry) {
        const name = entry.name;
        const defaultValue = entry.defaultValue;
        Object.defineProperty(RegExp.prototype, name, {
            enumerable: true,
            get: createPropertyGetter(name, defaultValue),
        });
    });

    Object.defineProperty(RegExp.prototype, "flags", {
        enumerable: true,
        get: function () {
            if (this._flags) {
                return this._flags;
            }
            try {
                return Object.getOwnPropertyDescriptor(
                    NativeRegExp.prototype,
                    "flags"
                ).get.call(this);
            } catch (e) {
                return "";
            }
        },
    });

    Object.defineProperty(RegExp.prototype, "source", {
        enumerable: true,
        get: function () {
            if (this._originalSource) {
                return this._originalSource;
            }
            try {
                return Object.getOwnPropertyDescriptor(
                    NativeRegExp.prototype,
                    "source"
                ).get.call(this);
            } catch (e) {
                return "";
            }
        },
    });

    Object.defineProperty(RegExp.prototype, "hasIndices", {
        enumerable: true,
        get: function () {
            if (this._flags !== undefined) {
                return this._flags.includes("d");
            }
            if (nativeSupportsIndices) {
                try {
                    return Object.getOwnPropertyDescriptor(
                        NativeRegExp.prototype,
                        "hasIndices"
                    ).get.call(this);
                } catch (e) {
                    return false;
                }
            }
            return this.flags.includes("d");
        },
    });

    RegExp.prototype.toString = function () {
        return "/" + this.source + "/" + this.flags;
    };

    RegExp.prototype.exec = function (str) {
        str = String(str);

        if (!this._regexp) {
            const result = NativeRegExp.prototype.exec.call(this, str);
            if (result) {
                updateRegExpStatics(result, str);
                if (this.hasIndices && !nativeSupportsIndices) {
                    result.indices = createIndicesArray(result, str);
                }
            }
            return result;
        }

        const info = this._lookbehindInfo;

        if (!info) {
            this._regexp.lastIndex = this.lastIndex;
            const match = this._regexp.exec(str);
            this.lastIndex = this._regexp.lastIndex;
            if (match) {
                updateRegExpStatics(match, str);
                if (this.hasIndices && !nativeSupportsIndices) {
                    match.indices = createIndicesArray(match, str);
                }
            }
            return match;
        }

        if (this.sticky && this.lastIndex > str.length) {
            return null;
        }

        this._regexp.lastIndex = this.lastIndex;

        while (true) {
            const match = this._regexp.exec(str);
            if (!match) {
                this.lastIndex = this._regexp.lastIndex;
                resetLastIndex(this);
                return null;
            }

            const i = match.index;

            if (this.sticky && i !== this.lastIndex) {
                if (!this.global) {
                    this.lastIndex = 0;
                    this._regexp.lastIndex = 0;
                    return null;
                }
                this._regexp.lastIndex =
                    match[0].length === 0 ? i + 1 : i + match[0].length;
                continue;
            }

            const passed = checkLookbehindAssertions(
                str,
                i,
                info.assertions,
                this.ignoreCase
            );

            if (passed) {
                match.index = i;
                match.input = str;
                this.lastIndex = this._regexp.lastIndex;
                updateRegExpStatics(match, str);
                if (this.hasIndices && !nativeSupportsIndices) {
                    match.indices = createIndicesArray(match, str);
                }
                resetLastIndex(this);
                return match;
            }

            if (!this.global) {
                this.lastIndex = 0;
                this._regexp.lastIndex = 0;
                return null;
            }

            if (match[0].length === 0) {
                this._regexp.lastIndex = i + 1;
            }
        }
    };

    RegExp.prototype.test = function (str) {
        if (!this._regexp) {
            return NativeRegExp.prototype.test.call(this, String(str));
        }
        return this.exec(str) !== null;
    };

    RegExp.prototype.constructor = RegExp;

    globalThis.RegExp = RegExp;

    if (globalThis.__lookbehind_patch_native_statics) {
        const originalNativeExec = NativeRegExp.prototype.exec;
        NativeRegExp.prototype.exec = function (str) {
            const result = originalNativeExec.call(this, String(str));
            if (result) {
                updateRegExpStatics(result, String(str));
            }
            return result;
        };
    }

    copyStaticProperties();

    const original = {
        replace: String.prototype.replace,
        match: String.prototype.match,
        search: String.prototype.search,
        split: String.prototype.split,
    };

    String.prototype.replace = function (search, replacement) {
        const str = String(this);
        if (isRegExpLike(search) && search._lookbehindInfo) {
            const re = search.global
                ? search
                : new RegExp(search.source, search.flags + "g");
            let result = "";
            let lastIndex = 0;
            let match;

            while ((match = re.exec(str))) {
                const i = match.index;
                result += str.slice(lastIndex, i);
                const replaceArgs = Array.prototype.slice.call(match);
                replaceArgs.push(i, str);
                result +=
                    typeof replacement === "function"
                        ? String(replacement.apply(undefined, replaceArgs))
                        : expandReplacementString(replacement, match, str, i);
                lastIndex = i + match[0].length;
                if (match[0] === "") re.lastIndex++;
                if (!search.global) break;
            }

            return result + str.slice(lastIndex);
        }

        return callNativeStringMethod(original.replace, str, search, replacement);
    };

    String.prototype.match = function (pattern) {
        const str = String(this);
        if (!isRegExpLike(pattern)) pattern = new RegExp(pattern);
        if (!pattern._lookbehindInfo) {
            return callNativeStringMethod(original.match, str, pattern);
        }
        if (pattern.global) {
            const results = [];
            let m;
            while ((m = pattern.exec(str))) {
                results.push(m[0]);
                if (m[0] === "") pattern.lastIndex++;
            }
            return results.length ? results : null;
        }
        return pattern.exec(str);
    };

    String.prototype.search = function (pattern) {
        const str = String(this);
        if (!isRegExpLike(pattern)) pattern = new RegExp(pattern);
        if (!pattern._lookbehindInfo) {
            return callNativeStringMethod(original.search, str, pattern);
        }
        const m = pattern.exec(str);
        return m ? m.index : -1;
    };

    String.prototype.split = function (separator, limit) {
        const str = String(this);
        if (!isRegExpLike(separator)) {
            return original.split.call(str, separator, limit);
        }
        if (!separator._lookbehindInfo) {
            return callNativeStringMethod(original.split, str, separator, limit);
        }

        const re = separator.global
            ? separator
            : new RegExp(separator.source, separator.flags + "g");
        const output = [];
        let lastIndex = 0;
        let match;

        while ((match = re.exec(str))) {
            output.push(str.slice(lastIndex, match.index));
            lastIndex = match.index + match[0].length;
            if (match[0] === "") re.lastIndex++;
            if (limit !== undefined && output.length >= limit) break;
        }

        output.push(str.slice(lastIndex));
        return output;
    };
})();
