const algorithmia = require('algorithmia')
const algorithmiaApiKey = require('../credentials/algothmia.json').apiKey
const setenceBoundryDetection = require('sbd')

const watsonApi = require('../credentials/watson-nlu.json')
const NaturalLanguageUnderstandingV1 = require('ibm-watson/natural-language-understanding/v1.js');
const { IamAuthenticator } = require('ibm-watson/auth'); 

const nlu = new NaturalLanguageUnderstandingV1({
    authenticator: new IamAuthenticator({
      apikey: watsonApi.apikey,
    }),
    version: '2019-07-12',
    serviceUrl: watsonApi.url
  });

const state = require('./state.js')

async function robot(){
    const content = state.load()

    await fetchContentFromWikipedia(content)
    sanitizeContent(content)
    breakContentIntoSentences(content)
    limitMaximumSentences(content)
    await fetchKeywordsOfAllSentences(content)
    state.save(content)
    

    async function fetchContentFromWikipedia(content){
        const algorithmiaAuthenticated = algorithmia(algorithmiaApiKey)
        const wikipediaAlgorithm = algorithmiaAuthenticated.algo('web/WikipediaParser/0.1.2')
        const wikipediaResponse = await wikipediaAlgorithm.pipe({
            'lang':'pt',
            'articleName': content.searchTerm
        })
        const wikipediaContent = wikipediaResponse.get()
        
        content.sourceContentOriginal = wikipediaContent.content
    }

    function sanitizeContent(content){
        const withoutBlankLinesAndMarkdown = removeBlankLinesAndMarkdown(content.sourceContentOriginal)
        const withoutDatesInParentheses = removeDatesInParentheses(withoutBlankLinesAndMarkdown)
        

        content.sourceContentSanitized = withoutDatesInParentheses

        function removeBlankLinesAndMarkdown(text){
            const allLines = text.split("\n")

            const withoutBlankLinesAndMarkdown = allLines.filter((line) => {
                if(line.trim().length === 0 || line.trim().startsWith('=')){
                    return false
                }

                return true
            })

            return withoutBlankLinesAndMarkdown.join(' ')
        }
    }

    function removeDatesInParentheses(text) {
        return text.replace(/\((?:\([^()]*\)|[^()])*\)/gm, '').replace(/  /g,' ')
    }

    function breakContentIntoSentences(content) {
        content.sentences = []

        const sentences = setenceBoundryDetection.sentences(content.sourceContentSanitized)
        sentences.forEach((sentence) => {
            content.sentences.push({
                text: sentence,
                keywords: [],
                images: []
            })
        })
    }

    function limitMaximumSentences(content) {
        content.sentences = content.sentences.slice(0, content.maximumSentences)
    }

    async function fetchKeywordsOfAllSentences(content){
        for (const sentence of content.sentences) {
            sentence.keywords = await fetchWatsonAndReturnKeywords(sentence.text)
        }
    }

    function fetchWatsonAndReturnKeywords(sentence) {
        return new Promise(function resolvePromise(resolve, reject) {
            nlu.analyze({
                text: sentence,
                features: {
                    keywords: {}
                }
            }).then(function(response){
                const keywords = response.result.keywords.map((keyword) => {
                    return keyword.text
                })
                
                resolve(keywords)
            })
        })
    }
}

module.exports = robot;