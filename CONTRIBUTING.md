# Contributing to BoarBot

> When you create a PR, please include details of how you tested 
> the changed code. Show images or videos showing the functionality both before and after. If your
> changes require a beta testing team, say so in the PR.

## The codebase

BoarBot is entirely written in TypeScript besides a couple Python scripts for creating animated images.

### Why TypeScript?
- Typing makes the code far more readable and easier to understand
- Similar to how Java looks and functions, making it easier to migrate the code to Java if needed
- Since it's built off JavaScript, it's one of the easiest languages to learn, making this repo very easy to contribute to

## Setting up

Getting the bot up and running is easy! Just follow the instructions below. Anticipate this changing in the future with Docker integration.

### Step 0: Creating a Discord Bot
- See [Discord Developer Portal](https://discord.com/developers/docs/intro)

### Step 1: Installing Node.js
- Install Node.js version [18.18.0 LTS](https://nodejs.org/dist/v18.18.0)
- This should come with npm, the suggested package manager for this project

### Step 2: Installing Python
- Install Python version [3.12.1](https://www.python.org/downloads/) or newer
- This is necessary for animated image generation
- Use a package management tool like PIP to install the following modules
 - Pillow
 - requests

### Step 3: Installing necessary modules
- Run the command `npm install --omit=dev` to install all modules you'll need. Below are the modules and their versions that are confirmed to be compatible.
  - discord.js@14.13.0
  - basic-ftp@5.0.3
  - dotenv@16.3.1
  - cron@2.4.4
  - child_process@1.0.2
  - axios@1.5.1
  - canvas@2.11.2
  - moment@2.29.4
  - @types/adm-zip@0.5.2
  - adm-zip@0.5.10
  - python-shell@5.0.0
  - typescript@5.2.2

### Step 4: Configurations
- Rename [example_config.json](example_config.json) to `config.json`
- Create a file in the root of the project names `.env`. Below is how the file should look. This includes potentially sensitive information. Don't share it!
  - Only `TOKEN`, `CLIENT_ID`, and `GUILD_ID` are required for normal function

![image](https://github.com/WeslayCodes/BoarBot/assets/60010287/c54dbf00-3205-4bab-b0f7-929c7a53cc25)

- In `config.json`, configure the `logChannel` field near the top of the file. `reportsChannel` and `updatesChannel` are also recommended but are optional

### Step 5: Running the Bot
- Enter this command in the root of the project: `tsc -p .` to compile the project
- Run the command `node dist/BoarBotApp.js deploy-commands`
  - For a quicker debugging experience, look into using ts-node
- Congrats! The Bot should be running!

## Style guidelines

With any project, you want to keep a consistent style throughout all project files. 
This increases readability and can make debugging easier.

### Type annotations
These should be used in a handful of places, usually in cases where it's impossible to know the type. Below are areas you should use type annotations.
- Interface properties. See [Bot.ts](src/main/js/api/bot/Bot.ts) or [Command.ts](src/main/js/api/commands/Command.ts)
- Function parameters and function return types. See [CanvasUtils.ts](src/main/js/util/generators/CanvasUtils.ts)
- Variable declarations

### Type assertions
Sometimes a type that's inferred is a little too wide or narrow. Use type assertion to get the type that's desired. Below are some specific cases.
- Readonly properties. Setting a readonly property to anything will be the strictest version, so use a type assertion. See [StringConfig.ts](src/main/js/bot/config/StringConfig.ts)
- Initializing a variable with an empty array. Use type assertion to make the type used in the array more obvious
- As stated before, any case where a type needs to be narrowed or widened

### Indentation
Gotta love indentation! There are some specifics that should be followed when indenting your code. 
These are in place to make it more obvious when your code could be improved as triangle indentation starts to show faster.
- 4-space indentation
- K&R indentation
- Be logical about it! If it feels like code should be indented, indent it
- Here are some examples of indentation that's preferred

![image](https://github.com/WeslayCodes/BoarBot/assets/60010287/bd6c44fa-a2c3-4b02-9f07-a081b09a93e1)
This is proper indentation, but it's getting close to "too much" indentation. You'd fix this using local variables
to store some longer lines of code

![image](https://github.com/WeslayCodes/BoarBot/assets/60010287/6ea0baaf-6923-4d44-b9d0-9aef90ea5a90)
This gives a better idea of how you should indent. Notice the brackets right next to the parentheses to save space.

### Dealing with multi-lines
When writing code for this project, you're likely to encounter instances where arguments, parameters, and more need to go multiple lines. Here's how to handle that.
- First, try to get all parameters/arguments/piped types/etc. on the same line
  - This can be done by having the function on the first line, the parameters/arguments/piped types/etc. on the second line, and the closing paren on the third line
- Second, if parameters/arguments/piped types/etc. still go multiple lines, give each its own line for readability. Below are some examples

![image](https://github.com/WeslayCodes/BoarBot/assets/60010287/2a93adf5-1856-4bcb-9e12-bee2fafe784a)
![image](https://github.com/WeslayCodes/BoarBot/assets/60010287/7c0d06e5-032f-47b0-a7c0-c853a08ab57a)
![image](https://github.com/WeslayCodes/BoarBot/assets/60010287/1e07f8e2-2ab9-47e5-8e18-a41dc8cf715a)
![image](https://github.com/WeslayCodes/BoarBot/assets/60010287/a844b2c6-cdf6-4fb9-8a73-c2fc141439d9)
![image](https://github.com/WeslayCodes/BoarBot/assets/60010287/aa051009-f4bf-4b44-9346-e87aa97ed7f3)

- Don't do this

![image](https://github.com/WeslayCodes/BoarBot/assets/60010287/155b271a-3e8b-4b1e-8781-a23655dc2584)

### Comments
- Every function and class requires a doc comment and look like this

![image](https://github.com/WeslayCodes/BoarBot/assets/60010287/f51dfef6-3fe2-4d24-a9a4-0e23e2e4dc0a)

- Commenting several statements at once should look like this

![image](https://github.com/WeslayCodes/BoarBot/assets/60010287/74c37a29-365e-4e95-8c71-9a1124338cfc)

- Commenting a block of code or a single line should look like this

![image](https://github.com/WeslayCodes/BoarBot/assets/60010287/4a7e87ab-e4bf-4e1e-9c77-5f21d10ae139)
![image](https://github.com/WeslayCodes/BoarBot/assets/60010287/e68e6389-e392-42bc-86d8-ad1d230b74a6)

### Miscellaneous
- Curly braces should exist in every case they can
  - The ONLY exception to this is an if statement that ONLY has return/continue/break after it. In this case, make it one line.
If it actually returns a value, it needs to use curly braces and be on a separate line
- Lines must not go over 120 characters in length. Most IDEs have a vertical line at this limit
- Functions and object initializers should end with parentheses, even if it's possible without them
- Semicolons must be used to terminate statements
- Imports must go at the very top of the file
