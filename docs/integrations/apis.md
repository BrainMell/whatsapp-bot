# External Integrations: APIs & Context Engines

## What it is
The External Integrations Subsystem connects the bot with external services, microservices, and AI APIs. It manages communications with:
1. The **Groq API** (`GroqClient`), which processes natural language prompts and extracts structured JSON objects using key rotation and exponential backoff retry algorithms.
2. The **Go Image Service** (`GoImageService`), which renders visual combat frames, profile cards, and queries the Klipy database. It uses a custom sequential execution queue to manage concurrent API requests safely.
3. The **Anime News Service** (`news.js`), which crawls external sites using the Go service and maintains a deduplication log of published article links using Mongoose storage.

## How it works

**Groq API Client with Key Rotation** — [GroqClient.js L41-L95](https://github.com/BrainMell/whatsapp-bot/blob/main/core/src/context_engine/GroqClient.js#L41-L95)
```javascript
    async extract(prompt) {
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            const currentKey = this.getApiKey();
            if (!currentKey) {
                console.error("❌ Groq API Key missing!");
                return null;
            }

            try {
                const response = await axios.post(`${this.baseUrl}/chat/completions`, {
                    model: this.model,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a precise data extraction assistant. Respond ONLY with valid JSON. No markdown. No explanations.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.1,
                    response_format: { type: 'json_object' }
                }, {
                    headers: {
                        'Authorization': `Bearer ${currentKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                });

                const content = response.data.choices[0].message.content;
                const usage = response.data.usage || {};
                
                console.log(`✅ Groq Extraction Success (Tokens: ${usage.total_tokens || 0})`);
                return JSON.parse(content);

            } catch (err) {
                attempts++;
                console.error(`⚠️ Groq Attempt ${attempts} failed on key #${this.currentKeyIndex + 1}: ${err.message}`);
                
                // Rotate key for the next attempt
                this.rotateKey();
                
                if (attempts < maxAttempts) {
                    await new Promise(r => setTimeout(r, 2000 * attempts)); // Backoff
                } else {
                    return null;
                }
            }
        }
    }
```
This method handles structured query extraction using the Groq API. It targets a JSON completions endpoint with temperature constraints, handles token statistics logging, rotates authorization keys on failures, and retries queries using an exponential delay backoff loop.

---

**Go Service Image Generation** — [goImageService.js L63-L76](https://github.com/BrainMell/whatsapp-bot/blob/main/core/utils/goImageService.js#L63-L76)
```javascript
  async generateCombatImage(data) {
    return this._enqueue(async () => {
      try {
        const response = await this.client.post("/api/combat", data, {
          responseType: "arraybuffer",
          timeout: 5000, // 5s timeout for fast fallback
        });
        return Buffer.from(response.data);
      } catch (error) {
        console.error("GoService Combat Error:", error.message);
        throw error;
      }
    });
  }
```
This method makes a POST request to the `/api/combat` endpoint of the Go microservice, passing player stats JSON data. It executes inside a custom enqueue wrapper to ensure only one heavy rendering request is sent to the backend service at a time, handling image assets as binary ArrayBuffers.

---

**News Fetching** — [news.js L24-L33](https://github.com/BrainMell/whatsapp-bot/blob/main/core/utils/news.js#L24-L33)
```javascript
async function getLatestNews() {
    try {
        const articles = await goService.getAnimeNews();
        console.log(`DEBUG: Scraped ${articles.length} news items from Go Service.`);
        return articles;
    } catch (err) {
        console.error("❌ Failed to fetch anime news from Go Service:", err.message);
        return [];
    }
}
```
This function calls the Go Service proxy to retrieve a scraped feed of anime news articles. It returns a structured array of articles containing titles, urls, and timestamps, which is then processed by caller routines to filter out already-posted content.

## How to modify it
To configure API request options or connection delays, developers can change key parameter settings in the respective source files.

```javascript
// BEFORE (GroqClient.js L72)
                    timeout: 30000
```
```javascript
// AFTER (GroqClient.js L72)
                    timeout: 15000 // Lowered timeout to 15 seconds to fail faster
```

```javascript
// BEFORE (goImageService.js L68)
          timeout: 5000, // 5s timeout for fast fallback
```
```javascript
// AFTER (goImageService.js L68)
          timeout: 8000, // Increased timeout to 8 seconds to allow for network lag
```

## Common tasks
- **Change Groq extraction timeout** — Adjust the max response wait time for Groq completions in [GroqClient.js L72](https://github.com/BrainMell/whatsapp-bot/blob/main/core/src/context_engine/GroqClient.js#L72).
- **Change Go Service combat render timeout** — Customize the API request timeout for rendering combat cards in [goImageService.js L68](https://github.com/BrainMell/whatsapp-bot/blob/main/core/utils/goImageService.js#L68).
- **Configure Groq model key rotation limit** — Update the maximum retry attempts when rotating keys in [GroqClient.js L43](https://github.com/BrainMell/whatsapp-bot/blob/main/core/src/context_engine/GroqClient.js#L43).
- **Adjust news history cache limit** — Set how many article link hashes are saved in the system database to prevent duplicates in [news.js L16-L19](https://github.com/BrainMell/whatsapp-bot/blob/main/core/utils/news.js#L16-L19).










---









# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and hold values in a program. They can be thought of as labeled boxes where you can store a value.
**General Example**
```javascript
let name = 'John';
console.log(name); // Outputs: John
```
**In Our Code**
```javascript
let attempts = 0;
const maxAttempts = 3;
```
**How it works here**: The `attempts` variable is used to keep track of the number of attempts made to extract data, while `maxAttempts` stores the maximum number of attempts allowed.
**Why it's used**: Variables are used to store values that need to be accessed and modified throughout the program.
**If you change/remove it**: If you remove the `attempts` variable, the program will not be able to keep track of the number of attempts made, and the `while` loop will not work as intended. If you change the value of `maxAttempts`, the program will allow a different number of attempts before giving up.

---
### Concept 2: Conditional Statements
Conditional statements are used to make decisions in a program based on certain conditions. They allow the program to execute different blocks of code depending on whether a condition is true or false.
**General Example**
```javascript
let age = 25;
if (age >= 18) {
  console.log('You are an adult');
} else {
  console.log('You are a minor');
}
```
**In Our Code**
```javascript
if (!currentKey) {
  console.error("❌ Groq API Key missing!");
  return null;
}
```
**How it works here**: The `if` statement checks if the `currentKey` variable is falsy (i.e., empty or null). If it is, the program logs an error message and returns `null`.
**Why it's used**: Conditional statements are used to handle different scenarios and make decisions based on certain conditions.
**If you change/remove it**: If you remove the `if` statement, the program will not check if the `currentKey` is present, and may throw an error or produce unexpected behavior.

---
### Concept 3: Loops
Loops are used to repeat a block of code for a specified number of times. They allow the program to execute a set of instructions repeatedly.
**General Example**
```javascript
for (let i = 0; i < 5; i++) {
  console.log(i);
}
```
**In Our Code**
```javascript
while (attempts < maxAttempts) {
  // code to be executed
}
```
**How it works here**: The `while` loop repeats the code inside it as long as the `attempts` variable is less than the `maxAttempts` variable.
**Why it's used**: Loops are used to repeat a set of instructions for a specified number of times.
**If you change/remove it**: If you remove the `while` loop, the program will not attempt to extract data multiple times. If you change the condition, the loop may repeat more or fewer times than intended.

---
### Concept 4: Functions
Functions are reusable blocks of code that perform a specific task. They can take arguments and return values.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
async extract(prompt) {
  // code to be executed
}
```
**How it works here**: The `extract` function takes a `prompt` argument and performs the data extraction task.
**Why it's used**: Functions are used to organize code, reduce repetition, and make it reusable.
**If you change/remove it**: If you remove the `extract` function, the program will not be able to perform the data extraction task. If you change the function signature, the program may not be able to call it correctly.

---
### Concept 5: Async/Await
Async/await is a syntax for writing asynchronous code that is easier to read and maintain. It allows the program to pause execution until a promise is resolved or rejected.
**General Example**
```javascript
async function example() {
  const data = await fetchData();
  console.log(data);
}
```
**In Our Code**
```javascript
async extract(prompt) {
  try {
    const response = await axios.post(`${this.baseUrl}/chat/completions`, {
      // code to be executed
    });
  } catch (err) {
    // error handling
  }
}
```
**How it works here**: The `extract` function uses async/await to pause execution until the `axios.post` promise is resolved or rejected.
**Why it's used**: Async/await is used to write asynchronous code that is easier to read and maintain.
**If you change/remove it**: If you remove the async/await syntax, the program will not be able to pause execution until the promise is resolved or rejected, and may produce unexpected behavior.

---
### Concept 6: Error Handling
Error handling is used to catch and handle errors that occur during the execution of a program. It allows the program to recover from errors and continue executing.
**General Example**
```javascript
try {
  const data = fetchData();
  console.log(data);
} catch (err) {
  console.error(err);
}
```
**In Our Code**
```javascript
try {
  const response = await axios.post(`${this.baseUrl}/chat/completions`, {
    // code to be executed
  });
} catch (err) {
  console.error(`⚠️ Groq Attempt ${attempts} failed on key #${this.currentKeyIndex + 1}: ${err.message}`);
}
```
**How it works here**: The `try` block attempts to execute the code, and the `catch` block catches any errors that occur.
**Why it's used**: Error handling is used to catch and handle errors that occur during the execution of a program.
**If you change/remove it**: If you remove the error handling, the program will not be able to catch and handle errors, and may produce unexpected behavior or crash.

---
### Concept 7: Object Properties
Object properties are used to store and access values in an object. They can be thought of as key-value pairs.
**General Example**
```javascript
const person = {
  name: 'John',
  age: 25
};
console.log(person.name); // Outputs: John
```
**In Our Code**
```javascript
const response = await axios.post(`${this.baseUrl}/chat/completions`, {
  model: this.model,
  messages: [
    {
      role: 'system',
      content: 'You are a precise data extraction assistant. Respond ONLY with valid JSON. No markdown. No explanations.'
    },
    {
      role: 'user',
      content: prompt
    }
  ],
  temperature: 0.1,
  response_format: { type: 'json_object' }
});
```
**How it works here**: The `response` object has properties such as `data`, `status`, and `headers`.
**Why it's used**: Object properties are used to store and access values in an object.
**If you change/remove it**: If you remove the object properties, the program will not be able to access the values stored in the object.

---
### Concept 8: JSON Parsing
JSON parsing is used to convert a JSON string into a JavaScript object.
**General Example**
```javascript
const jsonString = '{"name":"John","age":25}';
const jsonObject = JSON.parse(jsonString);
console.log(jsonObject.name); // Outputs: John
```
**In Our Code**
```javascript
const content = response.data.choices[0].message.content;
const jsonData = JSON.parse(content);
```
**How it works here**: The `JSON.parse` method is used to convert the `content` string into a JavaScript object.
**Why it's used**: JSON parsing is used to convert a JSON string into a JavaScript object.
**If you change/remove it**: If you remove the JSON parsing, the program will not be able to convert the JSON string into a JavaScript object.

---
### Concept 9: Timeouts
Timeouts are used to set a time limit for a specific operation. If the operation takes longer than the specified time, it will be cancelled.
**General Example**
```javascript
const timeout = 5000;
setTimeout(() => {
  console.log('Timeout exceeded');
}, timeout);
```
**In Our Code**
```javascript
timeout: 30000
```
**How it works here**: The `timeout` property is used to set a time limit for the `axios.post` request.
**Why it's used**: Timeouts are used to prevent the program from waiting indefinitely for a response.
**If you change/remove it**: If you remove the timeout, the program will wait indefinitely for a response. If you change the timeout value, the program will wait for a different amount of time before cancelling the operation.

---
### Concept 10: Promises
Promises are used to handle asynchronous operations. They represent a value that may not be available yet, but will be resolved at some point in the future.
**General Example**
```javascript
const promise = new Promise((resolve, reject) => {
  // asynchronous operation
  resolve('Value');
});
promise.then((value) => {
  console.log(value);
});
```
**In Our Code**
```javascript
const response = await axios.post(`${this.baseUrl}/chat/completions`, {
  // code to be executed
});
```
**How it works here**: The `axios.post` method returns a promise that is resolved when the response is received.
**Why it's used**: Promises are used to handle asynchronous operations.
**If you change/remove it**: If you remove the promise, the program will not be able to handle the asynchronous operation. If you change the promise, the program may not be able to handle the response correctly.
