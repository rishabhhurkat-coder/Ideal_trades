# EMA Intraday Trade Modal Flow

## Purpose

This page has two separate entry points:

1. `+Leg` opens the main trade entry page.
2. `Trade Date` opens the calendar popup.

## Current Flow

### When the user clicks `+Leg`

- Open the add-leg modal.
- Show the main trade page immediately.
- Show:
  - header summary tiles
  - trade rows / leg area
- Do not show the calendar/setup block in this modal.
- Do not show the `Selected Date`, `Expiry Date`, `DTE`, `GAP Status`, or `EMA Status` side panel here.

### When the user clicks `Trade Date`

- Open the trade date calendar popup from the header tile.
- Let the user pick the date there.
- Update the draft trade date, expiry, strike, GAP status, and EMA status from that popup.

## What This Part Is Not

- It is not the transition-rule system.
- It is not the strike suggestion logic.
- It is not the save logic.
- It is not the masters data model.

## Naming Guide

- `Calendar popup` = the separate date picker opened from `Trade Date`
- `Main trade page` = header tiles plus trade rows / leg area
- `Add-leg modal` = the wrapper that now loads the main trade page directly

