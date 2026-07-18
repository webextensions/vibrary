import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { emptySpec, hashContent, serializeVibraryXml } from '../../shared/vibraryXmlCore.js';
import { VIBRARY_INCLUDE_TEMPLATE } from './files.js';

// The starter entries `vibrary init` scaffolds, built through the core's own constructor and serializer so they are
// valid by construction (hand-written XML here would be a second copy of the format that could drift). They exist to
// DEMONSTRATE the model rather than describe it: an approved entry (the green badge, counted in approved/total), an
// entry relating to it (the relation chip and the target's Referenced by row), and labels on both (the label filter
// and chips) - the ideas a first-time user would otherwise only meet in an empty list.
const starterSpecs = function () {
    const welcome = {
        ...emptySpec('spec'),
        title: 'welcome-to-vibrary',
        createdBy: 'Human',
        content: 'Vibrary keeps reviews, specs, tasks and ideas as entries in XML files like this one. ' +
        'This entry is approved: a human signed off on exactly this text, which is why its badge is green. ' +
        'Edit the content and the approval turns stale (the yellow Reapprove) until someone signs off again.',
        labels: ['getting-started']
    };
    // Approved against its own content via the same hash rule the app checks - so the badge is genuinely green.
    welcome.approved = hashContent(welcome.content);
    const relations = {
        ...emptySpec('spec'),
        title: 'how-relations-work',
        createdBy: 'Human',
        content: 'Entries can relate to each other: this one relates to welcome-to-vibrary, shown as a clickable ' +
        'chip (and as a Referenced by row on the target). References resolve by exact title, folder-wide. ' +
        'Spec and task entries also carry an agent action - Apply this spec / Run this task - which hands the ' +
        'entry to the Claude CLI headlessly.',
        labels: ['getting-started'],
        relatesTo: ['welcome-to-vibrary']
    };
    return [welcome, relations];
};

// Scaffold the folder. Every write is CREATE-ONLY ('wx') - the same discipline the .vibraryinclude route follows "so
// it can never clobber patterns the user already wrote" - and each existing file is reported individually rather than
// skipped wholesale or overwritten, so a second init is safe and says exactly what it did not touch.
const initVibraryAsync = async function (cwd, { minimal = false } = {}) {
    const targets = [
        { name: '.vibraryinclude', content: VIBRARY_INCLUDE_TEMPLATE },
        ...(minimal ? [] : [{ name: 'specs.xml', content: serializeVibraryXml(starterSpecs()) }])
    ];
    const written = [];
    const skipped = [];
    for (const target of targets) {
        try {
            await writeFile(path.resolve(cwd, target.name), target.content, { encoding: 'utf8', flag: 'wx' });
            written.push(target.name);
        } catch (error) {
            if (error.code === 'EEXIST') {
                skipped.push(target.name);
            } else {
                throw error;
            }
        }
    }
    return { written, skipped };
};

export { initVibraryAsync };
