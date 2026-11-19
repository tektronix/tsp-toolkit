import { assert } from "chai"
import { suite, test } from "mocha"
import { toPythonClassName } from "../pythonClassName"

suite("TSP Converter class name normalization", function () {
    test("preserves PascalCase conversion for ordinary basenames", function () {
        assert.equal(toPythonClassName("my_script"), "MyScript")
        assert.equal(toPythonClassName("my-script name"), "MyScriptName")
    })

    test("replaces runs of other special characters with one underscore", function () {
        assert.equal(toPythonClassName("my@@script"), "My_Script")
        assert.equal(toPythonClassName("my.$#script"), "My_Script")
        assert.equal(toPythonClassName("@my@@script"), "_My_Script")
        assert.equal(toPythonClassName("my@@script@"), "My_Script_")
    })

    test("prefixes names that start with a digit", function () {
        assert.equal(toPythonClassName("123_test"), "_123Test")
    })

    test("prefixes Python keywords", function () {
        assert.equal(toPythonClassName("class"), "_Class")
        assert.equal(toPythonClassName("none"), "_None")
    })

    test("uses a fallback when the basename has no identifier characters", function () {
        assert.equal(toPythonClassName("@#$"), "TspWrapper")
    })
})
