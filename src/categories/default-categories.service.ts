import { Injectable } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { User } from '../users/user.entity';

@Injectable()
export class DefaultCategoriesService {
  constructor(private readonly categoriesService: CategoriesService) {}

  /**
   * Get the list of default categories
   */
  getDefaultCategories(): string[] {
    return [
      // 🏠 Home & Utilities
      'Rent', 'Mortgage', 'Electricity', 'Gas', 'Water', 'Internet & Phone',
      'Housing Fees', 'Home Maintenance', 'Appliances',

      // 🚗 Transportation
      'Fuel', 'Car Insurance', 'Car Tax', 'Car Maintenance',
      'Public Transport', 'Parking / Tolls', 'Car / Scooter Rental',

      // 🛒 Daily Expenses
      'Groceries', 'Pharmacy', 'Personal Care', 'Tobacco',

      // 🍽️ Restaurants & Bars
      'Restaurant', 'Cafe / Breakfast', 'Takeaway / Delivery',

      // 🛍️ Shopping
      'Clothing', 'Electronics', 'Gifts', 'Books / Media',

      // 🎓 Education & Training
      'School / University', 'Textbooks', 'Courses / Educational Subscriptions',

      // ⚕️ Health
      'Medical Visits', 'Tests / Exams', 'Health Insurance',

      // 👶 Family & Children
      'Daycare / School', 'Children Clothing', 'Babysitter', 'Recreational Activities',

      // 🎉 Leisure
      'Travel', 'Streaming Subscriptions', 'Cinema / Theater', 'Events / Concerts', 'Sports / Gym',

      // 💼 Work & Professional
      'Professional Expenses', 'Business Utilities', 'Office Supplies',

      // 💸 Personal Finance
      'Savings', 'Investments', 'Donations', 'Bank Fees', 'Credit Card Bill Payment'
    ];
  }

  /**
   * Create default categories for a user
   */
  async createDefaultCategoriesForUser(user: User): Promise<void> {
    const defaultCategories = this.getDefaultCategories();
    
    for (const categoryName of defaultCategories) {
      try {
        await this.categoriesService.create({ name: categoryName }, user);
      } catch (error) {
        // Skip if category already exists
        console.error(`Error creating category ${categoryName} for user ${user.id}: ${error.message}`);
      }
    }
  }

  /**
   * Reset categories to defaults for a user
   * This will create any missing default categories
   */
  async resetCategoriesToDefaults(user: User): Promise<void> {
    await this.createDefaultCategoriesForUser(user);
  }
} 