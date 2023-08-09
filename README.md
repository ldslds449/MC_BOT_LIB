# MC Tedious Bot

A Minecraft bot doing tedious things.

## Overview

This project is written in TypeScript. We implement some feature, such as AutoAttack, AutoEat. You can write your own task to enhance your Minecraft Bot!

## Install

First we need to install all dependencies.

```bash
npm install
```

## Run

`ts-node` is used to execute TypeScript on the fly.

```bash
npm run start
```

To show the debug information, type this command before running.

```bash
export DEBUG=MC_BOT_LIB:*
```

## Build

We first convert TypeScript to CommonJS, then use `pkg` to package it to a executable file.

We build two different types executable files:

1. Linux-x64
2. Windows-x64

```bash
npm run binary
```

## Test

We use `Jest` to write some test to ensure the correctness of our code.

```bash
npm run test
npm run test_auth
npm run test_create
npm run test_attack
npm run test_autoEat
npm run test_depositEmerald
```
