import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Create axios instance with interceptor
const api = axios.create({
  baseURL: API_URL,
});

// Add token to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

class ClubService {
  // DRINKS - Use /drinks endpoint
  async createDrinkType(drinkData) {
    try {
      const response = await api.post('/drinks', drinkData);
      return response.data;
    } catch (error) {
      console.error('Error creating drink type:', error);
      
      if (error.response?.status === 403) {
        throw new Error(error.response.data.message || 'You do not have permission to create drinks.');
      }
      if (error.response?.status === 401) {
        throw new Error('Please log in to continue.');
      }
      
      throw error;
    }
  }

  async getDrinkTypes() {
    try {
      const response = await api.get('/drinks');
      return response.data;
    } catch (error) {
      console.error('Error fetching drink types:', error);
      throw error;
    }
  }

  async updateDrink(id, drinkData) {
    try {
      const response = await api.put(`/drinks/${id}`, drinkData);
      return response.data;
    } catch (error) {
      console.error('Error updating drink:', error);
      throw error;
    }
  }

  async deleteDrink(id) {
    try {
      const response = await api.delete(`/drinks/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting drink:', error);
      throw error;
    }
  }

  // CLUBS
  async createClub(clubData) {
    try {
      const response = await api.post('/clubs', clubData);
      return response.data;
    } catch (error) {
      console.error('Error creating club:', error);
      throw error;
    }
  }

  async getClubs() {
    try {
      const response = await api.get('/clubs');
      return response.data;
    } catch (error) {
      console.error('Error fetching clubs:', error);
      throw error;
    }
  }
}

export const clubService = new ClubService();
export default clubService;