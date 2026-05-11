export const useUserStore = defineStore("user", {
  state: () => ({
    username: null,
    user_id: null,
    full_name: null,
    email: null,
    address: null,
    phone_number: null,
    role: 'user'
  }),
  actions: {
    async fetchUser() {
      try {
        const response = await $fetch("/api/user");
        this.user_id = response.user_id;
        this.full_name = response.full_name;
        this.email = response.email;
        this.address = response.address;
        this.phone_number = response.phone_number;
        this.role = response.role;
      } catch (err) {
        // user is not logged-in
        console.error(err);
      }
    },
  },
});
