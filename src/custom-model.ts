// This file extends the brackets-model package with our custom types

import { StageType as OriginalStageType } from 'brackets-model';

// Extend the StageType to include our new gymnastics_elimination type
export type StageType = OriginalStageType | 'gymnastics_elimination';

// Export the extended type to be used in our application
export * from 'brackets-model';
