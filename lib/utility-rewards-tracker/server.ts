import {env} from 'cloudflare:workers';
import {rewardsTrackerEnabled} from './gate.mjs';

export function trackerReleased() { return rewardsTrackerEnabled(env); }
