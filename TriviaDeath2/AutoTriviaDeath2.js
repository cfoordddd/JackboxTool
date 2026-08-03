// ==UserScript==
// @name         AutoTriviaDeath2
// @namespace    https://github.com/cfoordddd/JackboxTool/TriviaDeath2
// @version      0.4.0
// @description  Trivia Murder Party 2 - Auto Helper
// @author       cfoordddd
// @match        https://jackbox.tv/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=brave.com
// @resource     TDQuestion    https://raw.githubusercontent.com/cfoordddd/AutoTMP2/master/data/TDQuestion.json
// @resource     TDFinalRound  https://raw.githubusercontent.com/cfoordddd/AutoTMP2/master/data/TDFinalRound.json
// @resource     TDDictation   https://raw.githubusercontent.com/cfoordddd/AutoTMP2/master/data/TDDictation.json
// @grant        GM_getResourceText
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict'

    var HIGHLIGHT_CLASS = 'tmp2-correct-answer'

    function normalize(text){
        return text
            .replace(/\[\/?i\]/g, '')
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

    function buildDictationEntries(dataset){
        return dataset.content.map(function(item){
            return {
                lines: item.text.map(normalize),
                fullText: item.text.join(' ')
            }
        })
    }

    function loadDictationEntries(){
        var TDDictation = JSON.parse(GM_getResourceText('TDDictation'))
        return buildDictationEntries(TDDictation)
    }

    function matchDictationCandidates(entries, observedLines){
        return entries.filter(function(entry){
            if (entry.lines.length < observedLines.length) return false
            for (var i = 0; i < observedLines.length; i++){
                if (entry.lines[i] !== observedLines[i]) return false
            }
            return true
        })
    }

    function setNativeValue(el, value){
        var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
        setter.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
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
    var dictationEntries = loadDictationEntries()
    var lastPrompt = null
    var lastCorrectSet = null
    var lastDictationPrompt = null
    var dictationState = { observedLines: [], filled: false }

    function resetDictationState(){
        dictationState.observedLines = []
        dictationState.filled = false
    }

    function tickDictation(){
        var textarea = document.querySelector('#input-text-textarea[placeholder="TYPE LETTER HERE"]')
        if (!textarea) {
            lastDictationPrompt = null
            resetDictationState()
            return false
        }

        var promptEl = document.querySelector('#prompt')
        var promptText = promptEl ? normalize(promptEl.textContent) : ''

        if (promptText === lastDictationPrompt) return true
        lastDictationPrompt = promptText

        if (!promptText || promptText === 'get ready') {
            resetDictationState()
            return true
        }

        if (dictationState.filled) return true

        dictationState.observedLines.push(promptText)

        var candidates = matchDictationCandidates(dictationEntries, dictationState.observedLines)

        if (candidates.length === 0) {
            console.warn('[Auto-TMP2] no dictation match for observed lines:', dictationState.observedLines)
            dictationState.observedLines = [promptText]
            candidates = matchDictationCandidates(dictationEntries, dictationState.observedLines)
        }

        if (candidates.length === 1) {
            setNativeValue(textarea, candidates[0].fullText)
            dictationState.filled = true
        }

        return true
    }

    function tick(){
        if (tickDictation()) return

        var promptEl = document.querySelector('#prompt')
        if (!promptEl) {
            lastPrompt = null
            lastCorrectSet = null
            return
        }

        var promptText = normalize(promptEl.textContent)
        if (promptText !== lastPrompt) {
            lastPrompt = promptText

            var mathSpan = promptEl.querySelector('span[aria-hidden="true"]')
            var mathResult = mathSpan ? parseMathExpression(mathSpan.textContent.trim()) : null

            if (mathResult !== null) {
                lastCorrectSet = new Set([normalize(String(mathResult))])
            } else {
                lastCorrectSet = index.get(promptText)

                if (!lastCorrectSet) {
                    console.warn('[Auto-TMP2] no answer match for prompt:', promptEl.textContent.trim())
                }
            }
        }

        var buttons = document.querySelectorAll('#choicesRegion .choice-button')
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
