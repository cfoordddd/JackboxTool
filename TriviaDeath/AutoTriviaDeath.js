// ==UserScript==
// @name         AutoTriviaDeath
// @namespace    https://github.com/cfoordddd/JackboxTool
// @version      0.4.0
// @description  Trivia Murder Party - Auto Helper
// @author       cfoordddd
// @match        https://jackbox.tv/*
// @icon         https://raw.githubusercontent.com/cfoordddd/JackboxTool/main/TriviaDeath/data/icon.webp
// @resource     TDQuestion      https://raw.githubusercontent.com/cfoordddd/JackboxTool/main/TriviaDeath/data/TDQuestion.json
// @resource     TDFinalRound    https://raw.githubusercontent.com/cfoordddd/JackboxTool/main/TriviaDeath/data/TDFinalRound.json
// @grant        GM_getResourceText
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict'

    var HIGHLIGHT_CLASS = 'td-correct-answer'

    function normalize(text){
        return text
            .replace(/<\/?i>/g, '')
            .replace(/[‘’]/g, "'")
            .replace(/[“”]/g, '"')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase()
    }

    var MATH_EXPRESSION_RE = /^(\d+(?:\.\d+)?)\s*([+\-−×xX*÷/])\s*(\d+(?:\.\d+)?)$/

    function parseMathExpression(text){
        var match = MATH_EXPRESSION_RE.exec(text)
        if (!match) return null

        var a = parseFloat(match[1])
        var b = parseFloat(match[3])

        switch (match[2]){
            case '+': return a + b
            case '-':
            case '−': return a - b
            case '×':
            case 'x':
            case 'X':
            case '*': return a * b
            case '÷':
            case '/': return a / b
            default: return null
        }
    }

    function buildIndex(dataset){
        var map = new Map()
        dataset.content.forEach(function(item){
            var correctSet = new Set(
                item.choices
                    .filter(function(c){ return c.correct })
                    .map(function(c){ return normalize(c.text) })
            )
            map.set(normalize(item.text), correctSet)
        })
        return map
    }

    function loadIndex(){
        var TDQuestion = JSON.parse(GM_getResourceText('TDQuestion'))
        var TDFinalRound = JSON.parse(GM_getResourceText('TDFinalRound'))

        var index = new Map()
        buildIndex(TDQuestion).forEach(function(v, k){ index.set(k, v) })
        buildIndex(TDFinalRound).forEach(function(v, k){ index.set(k, v) })
        return index
    }

    function injectStyle(){
        var style = document.createElement('style')
        style.textContent =
            '.' + HIGHLIGHT_CLASS + ' {' +
            '  outline: 4px solid #2ecc71 !important;' +
            '  outline-offset: -4px;' +
            '  box-shadow: 0 0 12px rgba(46, 204, 113, 0.9) !important;' +
            '}'
        document.head.appendChild(style)
    }

    var index = loadIndex()
    var lastPrompt = null
    var lastCorrectSet = null
    var lastFinalPrompt = null
    var lastFinalCorrectSet = null

    function tickFinalRound(){
        var stateEl = document.querySelector('#state-make-many-choices')
        var promptEl = document.querySelector('#many-text')

        if (!stateEl || stateEl.classList.contains('pt-page-off') || !promptEl) {
            lastFinalPrompt = null
            lastFinalCorrectSet = null
            return false
        }

        var promptText = normalize(promptEl.textContent)
        if (promptText !== lastFinalPrompt) {
            lastFinalPrompt = promptText
            lastFinalCorrectSet = index.get(promptText)

            if (!lastFinalCorrectSet) {
                console.warn('[Auto-TD] no answer match for category:', promptEl.textContent.trim())
            }
        }

        var buttons = document.querySelectorAll('#make-many-choices-choices button.make-many-choices-button')
        buttons.forEach(function(btn){
            var isCorrect = lastFinalCorrectSet ? lastFinalCorrectSet.has(normalize(btn.textContent)) : false
            btn.classList.toggle(HIGHLIGHT_CLASS, isCorrect)
        })

        return true
    }

    function tick(){
        if (tickFinalRound()) return

        var stateEl = document.querySelector('#state-make-single-choice')
        var promptEl = document.querySelector('#make-single-choice-text p')

        if (!stateEl || stateEl.classList.contains('pt-page-off') || !promptEl) {
            lastPrompt = null
            lastCorrectSet = null
            return
        }

        var promptText = normalize(promptEl.textContent)
        if (promptText !== lastPrompt) {
            lastPrompt = promptText

            var mathResult = parseMathExpression(promptEl.textContent.trim())

            if (mathResult !== null) {
                lastCorrectSet = new Set([normalize(String(mathResult))])
            } else {
                lastCorrectSet = index.get(promptText)

                if (!lastCorrectSet) {
                    console.warn('[Auto-TD] no answer match for prompt:', promptEl.textContent.trim())
                }
            }
        }

        var buttons = document.querySelectorAll('#make-single-choice-choices button.button-choice')
        buttons.forEach(function(btn){
            var isCorrect = lastCorrectSet ? lastCorrectSet.has(normalize(btn.textContent)) : false
            btn.classList.toggle(HIGHLIGHT_CLASS, isCorrect)
        })
    }

    var scheduled = false
    function schedule(){
        if (scheduled) return
        scheduled = true
        requestAnimationFrame(function(){
            scheduled = false
            tick()
        })
    }

    injectStyle()
    new MutationObserver(schedule).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    })
    schedule()
})()
