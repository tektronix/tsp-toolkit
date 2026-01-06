import { assert } from "chai"
import { suite, test } from "mocha"
import { Root, TableVarParser } from "../debugResourceManager"

suite("Structured Variable Parser Test Suite", function () {
    let tableVarParser: TableVarParser

    this.beforeAll(() => {
        tableVarParser = new TableVarParser()
    })

    test("JsonFormatOneD", function () {
        const ip = '{"table":[{"name":"B","value":34},{"name":"F","value":56}]}'
        /**
         * JSON format of table content
        {
            "table": [{
                "name": "B",
                "value": 34
            }, {
                "name": "F",
                "value": 56
            }]
        }
         */
        const res = JSON.parse(ip) as Root

        const rv = tableVarParser.parseMainTable(res, "mainTab", 0, "locals")
        assert.equal(rv.name, "mainTab")

        //checking if mainTab value is another table array
        if (Array.isArray(rv.value)) {
            //mainTab has two elements
            assert.equal(rv.value.length, 2)
            //value of first element is 34
            assert.equal(rv.value[0].value, 34)
        } else {
            assert.isTrue(
                false,
                `rv.value was expected to be an Array, but was ${typeof rv.value}`,
            )
        }
    })

    test("JsonFormatSimple2D", function () {
        const ip =
            '{ "table" : [{ "name":"y", "value" :"y"},{ "name":"x", "value" :"x"},{ "name":"t", "value" :{ "table" : [{ "name":"y", "value" :"yy"},{ "name":"x", "value" :"xx"}]}}]}'
        /**
         * JSON format of table content
            {
                "table": [{
                    "name": "y",
                    "value": "y"
                }, {
                    "name": "x",
                    "value": "x"
                }, {
                    "name": "t",
                    "value": {
                        "table": [{
                            "name": "y",
                            "value": "yy"
                        }, {
                            "name": "x",
                            "value": "xx"
                        }]
                    }
                }]
            }
         */
        const res = JSON.parse(ip) as Root

        const rv = tableVarParser.parseMainTable(res, "mainTab", 0, "locals")
        assert.isTrue(Array.isArray(rv.value))

        //checking if mainTab value is another table array
        if (Array.isArray(rv.value)) {
            //mainTab has three elements and name of first element is y
            assert.equal(rv.value[0].name, '"y"')
        } else {
            assert.isTrue(
                false,
                `rv.value was expected to be an Array, but was ${typeof rv.value}`,
            )
        }
    })

    test("JsonFormatEmptyTable", function () {
        const ip =
            '{"table":[{"name":"B","value":{"table":[{"name":"C1","value":{"table":[]}},{"name":"C2","value":true}]}},{"name":"F","value":56}]}'
        /**
         * JSON format of table content
            {
                "table": [{
                    "name": "B",
                    "value": {
                        "table": [{
                            "name": "C1",
                            "value": {
                                "table": []
                            }
                        }, {
                            "name": "C2",
                            "value": true
                        }]
                    }
                }, {
                    "name": "F",
                    "value": 56
                }]
            }
         */
        const res = JSON.parse(ip) as Root

        const rv = tableVarParser.parseMainTable(res, "mainTab", 0, "globals")

        //checking if mainTab value is another table array
        if (Array.isArray(rv.value)) {
            //checking if first element of mainTab is another table array - B
            if (Array.isArray(rv.value[0].value)) {
                //checking if first element of table B is another table array - C1
                if (Array.isArray(rv.value[0].value[0].value)) {
                    //C1 is an empty table
                    assert.equal(rv.value[0].value[0].value.length, 0)
                } else {
                    assert.isTrue(
                        false,
                        `rv.value[0].value[0].value was expected to be an Array, but was ${typeof rv
                            .value[0].value[0].value}`,
                    )
                }
            } else {
                assert.isTrue(
                    false,
                    `rv.value[0].value was expected to be an Array, but was ${typeof rv
                        .value[0].value}`,
                )
            }
        } else {
            assert.isTrue(
                false,
                `rv.value was expected to be an Array, but was ${typeof rv.value}`,
            )
        }
    })
})
