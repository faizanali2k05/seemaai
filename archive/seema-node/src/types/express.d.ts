declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        firmId: string;
        role: string;
        email: string;
      };
    }
  }
}

export {};
