import { StatusCodes } from "http-status-codes";

import type { User } from "@/api/user/userModel";
import { UserRepository } from "@/api/user/userRepository";
import { ServiceResponse } from "@/common/models/serviceResponse";
import { logger } from "@/server";

import { eq } from "drizzle-orm";
import { drizzle } from 'drizzle-orm/better-sqlite3';
// import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

// Initialize and connect to the SQLite database
const sqlite = new Database('database.sqlite');
const db = drizzle({ client: sqlite });

import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
// Define the users table schema
const usersTable = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  age: integer('age').notNull(),
  role: text('role').notNull(),
});

const settingsDefault = {
  darkmode: false,
  notifications: {
    email: {
      daily: 'enabled',
    },
    mobilepush: {
      app_dm: 'disabled',
      app_ads: 'disabled'
    }
  }
}

export interface UserSettings {
  darkmode: boolean,
  notifications: {
    email: {
      daily: string | boolean,
    },
    mobilepush: {
      app_dm: string | boolean,
      app_ads: string | boolean
    }
  }
}

export type NotificationType = 'email' | 'mobilepush';

// Create the User Settings DB
const UserSettingsDB = new Map();

export class UserService {
  private userRepository: UserRepository;

  constructor(repository: UserRepository = new UserRepository()) {
    this.userRepository = repository;
  }

  // Retrieves all users from the database
  async findAll({ filter }: { filter?: string } = {}): Promise<ServiceResponse<User[] | null>> {
    try {
      const users = await this.userRepository.findAllAsync({ filter });
      if (!users || users.length === 0) {
        return ServiceResponse.failure("No Users found", null, StatusCodes.NOT_FOUND);
      }
      return ServiceResponse.success<User[]>("Users found", users);
    } catch (ex) {
      const errorMessage = `Error finding all users: $${(ex as Error).message}`;
      logger.error(errorMessage);
      return ServiceResponse.failure(
        "An error occurred while retrieving users.",
        null,
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  }

// Save user information to the database
async saveUser(user: User): Promise<ServiceResponse<User | null>> {
  try {
    const result = await db.update(usersTable)
      .set(user)
      .where(eq(usersTable.id, 1));

    if (!result || result.changes === 0) {
      return ServiceResponse.failure("User not found", null, StatusCodes.INTERNAL_SERVER_ERROR);
    }

    return ServiceResponse.success<User>("User found", user);
  } catch (error) {
    return ServiceResponse.failure("An error occurred while finding user settings.", null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
}

  // Retrieves a single user by their ID
  async findById(id: number): Promise<ServiceResponse<User | null>> {
    try {
      const user = await this.userRepository.findByIdAsync(id);
      if (!user) {
        return ServiceResponse.failure("User not found", null, StatusCodes.NOT_FOUND);
      }
      return ServiceResponse.success<User>("User found", user);
    } catch (ex) {
      const errorMessage = `Error finding user with id ${id}:, ${(ex as Error).message}`;
      logger.error(errorMessage);
      return ServiceResponse.failure("An error occurred while finding user.", null, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  }

  async getUserSettingsForUser(userId: string): Promise<ServiceResponse<UserSettings | null>> {
    try {
      const userSettings = UserSettingsDB.get(userId) || settingsDefault;
      return ServiceResponse.success<UserSettings>("User settings found", userSettings);
    } catch (ex) {
      const errorMessage = `Error finding user settings for user with id ${userId}:, ${(ex as Error).message}`;
      logger.error(errorMessage);
      return ServiceResponse.failure("An error occurred while finding user settings.", null, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  }

  async setUserSettingsForUser(userId: string, userSettings: UserSettings): Promise<ServiceResponse<UserSettings | null>> {
    try {
      UserSettingsDB.set(userId, { ...settingsDefault, ...userSettings });
      return ServiceResponse.success<UserSettings>("User settings updated", userSettings);
    } catch (ex) {
      const errorMessage = `Error updating user settings for user with id ${userId}:, ${(ex as Error).message}`;
      logger.error(errorMessage);
      return ServiceResponse.failure("An error occurred while updating user settings.", null, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  }

  async setUserNotificationSetting(userId: string, notificationType: NotificationType, notificationMode: string, notificationModeValue: string | boolean): Promise<ServiceResponse<UserSettings | null>> {
    try {
      const userSettings = { ...settingsDefault, ...UserSettingsDB.get(userId) };
      userSettings.notifications[notificationType][notificationMode] = notificationModeValue;

      UserSettingsDB.set(userId, userSettings);
      return ServiceResponse.success<UserSettings>("User settings updated", userSettings);
    } catch (ex) {
      const errorMessage = `Error updating user settings for user with id ${userId}:, ${(ex as Error).message}`;
      logger.error(errorMessage);
      return ServiceResponse.failure("An error occurred while updating user settings.", null, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  }

}

export const userService = new UserService();
