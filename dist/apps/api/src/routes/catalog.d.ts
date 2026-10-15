import { Router } from 'express';
import { LibraryRepository, UserRepository } from '../storage/repositories.js';
export declare function createCatalogRouter(repository: LibraryRepository, users: UserRepository): Router;
